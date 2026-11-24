// NFS-e Nacional (Sefin Nacional / Ambiente de Dados Nacional) — nota fiscal de SERVIÇO.
//
// Como funciona a API do governo:
//   • a empresa monta a DPS (Declaração de Prestação de Serviço) em XML, assina com o
//     certificado ICP-Brasil A1 (XMLDSig) e envia compactada (GZip + Base64) num JSON;
//   • a conexão é mTLS: o mesmo certificado autentica a empresa no servidor;
//   • POST /nfse é síncrono: devolve a chave de acesso (50 dígitos) e o XML da NFS-e;
//   • GET /dps/{id} recupera a chave de uma DPS já enviada (evita nota duplicada);
//   • POST /nfse/{chave}/eventos registra eventos, como o cancelamento (e101101).
//
// Sem dependências: XML gerado aqui (já na forma canônica C14N), assinatura com node:crypto
// e o certificado .pfx convertido pelo openssl do servidor.
import { request } from 'node:https';
import { gzipSync, gunzipSync } from 'node:zlib';
import { createHash, createSign, createPrivateKey, X509Certificate } from 'node:crypto';
import { execFile } from 'node:child_process';
import { writeFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const NS = 'http://www.sped.fazenda.gov.br/nfse';
const DSIG = 'http://www.w3.org/2000/09/xmldsig#';
export const DPS_VERSION = '1.01';
export const APP_VERSION = 'Iris-1.0';

export const BASES = {
  1: 'https://sefin.nfse.gov.br/SefinNacional', // produção
  2: 'https://sefin.producaorestrita.nfse.gov.br/SefinNacional', // produção restrita (homologação)
};

// ---------------- XML (forma canônica: sem declarações extras, tags sempre abertas e fechadas) ----------------

const clean = (v) => String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/\r/g, '').trim();
const text = (v) => clean(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attr = (v) => clean(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
const has = (v) => v !== undefined && v !== null && String(v).trim() !== '';
/** <tag>valor</tag>, ou nada se o valor estiver vazio. Filhos: passe um array de strings. */
const el = (tag, v) => {
  if (Array.isArray(v)) {
    const inner = v.filter(Boolean).join('');
    return inner ? `<${tag}>${inner}</${tag}>` : '';
  }
  return has(v) ? `<${tag}>${text(v)}</${tag}>` : '';
};
const digits = (v) => String(v ?? '').replace(/\D/g, '');
const money = (cents) => (Math.round(Number(cents)) / 100).toFixed(2);

/** Data/hora no fuso de Brasília (AAAA-MM-DDThh:mm:ss-03:00). Um minuto atrás para não cair no futuro. */
export function nowBr(d = new Date(Date.now() - 60_000)) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(d).reduce((a, x) => ((a[x.type] = x.value), a), {});
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}-03:00`;
}

/** Id da DPS: "DPS" + município (7) + tipo de inscrição (1) + CNPJ/CPF (14) + série (5) + número (15) = 45. */
export function dpsId(cfg, number) {
  const doc = digits(cfg.cnpj || cfg.cpf);
  const tpInsc = doc.length === 11 ? '1' : '2';
  return `DPS${digits(cfg.cLocEmi).padStart(7, '0')}${tpInsc}${doc.padStart(14, '0')}${digits(cfg.serie || '1').padStart(5, '0')}${String(number).padStart(15, '0')}`;
}

const docTag = (doc) => (digits(doc).length === 11 ? el('CPF', digits(doc)) : el('CNPJ', digits(doc)));

/**
 * Corpo do <infDPS> na ordem do XSD (a ordem importa: fora dela a DPS é rejeitada).
 * cfg: dados fixos do prestador (Integrações > NFS-e). d: dados desta nota.
 */
export function infDpsBody(cfg, d) {
  const tpAmb = Number(cfg.tpAmb) === 1 ? 1 : 2;
  const t = d.taker || {};
  const s = d.service || {};
  const end = has(t.cMun) && has(t.cep) && has(t.street)
    ? el('end', [el('endNac', [el('cMun', digits(t.cMun)), el('CEP', digits(t.cep))]), el('xLgr', t.street), el('nro', t.number || 'S/N'), el('xCpl', t.complement), el('xBairro', t.district || 'Centro')])
    : '';
  const tomador = has(t.doc)
    ? el('toma', [docTag(t.doc), el('xNome', String(t.name || '').slice(0, 300)), end, el('fone', digits(t.phone).slice(0, 20)), el('email', t.email)])
    : '';
  const ibscbs = cfg.ibscbs?.enabled
    ? el('IBSCBS', [
        el('finNFSe', '0'), el('indFinal', cfg.ibscbs.indFinal ? '1' : '0'), el('cIndOp', digits(cfg.ibscbs.cIndOp)), el('indDest', '0'),
        el('valores', [el('trib', [el('gIBSCBS', [el('CST', digits(cfg.ibscbs.CST)), el('cClassTrib', digits(cfg.ibscbs.cClassTrib))])])]),
      ])
    : '';
  return [
    el('tpAmb', tpAmb),
    el('dhEmi', d.dhEmi || nowBr()),
    el('verAplic', APP_VERSION),
    el('serie', digits(cfg.serie || '1')),
    el('nDPS', d.number),
    el('dCompet', d.competencia || nowBr().slice(0, 10)),
    el('tpEmit', '1'), // 1 = o próprio prestador emite
    el('cLocEmi', digits(cfg.cLocEmi)),
    // prestador: nome e endereço vêm do cadastro nacional quando ele mesmo emite
    el('prest', [
      docTag(cfg.cnpj || cfg.cpf),
      el('IM', cfg.im),
      el('regTrib', [el('opSimpNac', cfg.opSimpNac || '1'), Number(cfg.opSimpNac) === 3 ? el('regApTribSN', cfg.regApTribSN || '1') : '', el('regEspTrib', cfg.regEspTrib || '0')]),
    ]),
    tomador,
    el('serv', [
      el('locPrest', [el('cLocPrestacao', digits(s.cLocPrestacao || cfg.cLocEmi))]),
      el('cServ', [el('cTribNac', digits(s.cTribNac || cfg.cTribNac)), el('cTribMun', s.cTribMun || cfg.cTribMun), el('xDescServ', String(s.description || '').slice(0, 2000)), el('cNBS', digits(s.cNBS || cfg.cNBS))]),
    ]),
    el('valores', [
      el('vServPrest', [el('vServ', money(d.amountCents))]),
      el('trib', [
        el('tribMun', [el('tribISSQN', cfg.tribISSQN || '1'), el('tpRetISSQN', d.issRetido ? '2' : '1'), has(cfg.pAliq) ? el('pAliq', Number(cfg.pAliq).toFixed(2)) : '']),
        el('totTrib', has(cfg.pTotTribSN) ? [el('pTotTribSN', Number(cfg.pTotTribSN).toFixed(2))] : [el('indTotTrib', '0')]),
      ]),
    ]),
    ibscbs,
  ].join('');
}

/** Valida o mínimo antes de gastar uma chamada ao governo. */
export function checkConfig(cfg) {
  const miss = [];
  if (![11, 14].includes(digits(cfg.cnpj || cfg.cpf).length)) miss.push('CNPJ do prestador');
  if (digits(cfg.cLocEmi).length !== 7) miss.push('código IBGE do município (7 dígitos)');
  if (digits(cfg.cTribNac).length !== 6) miss.push('código de tributação nacional (6 dígitos)');
  if (digits(cfg.cNBS).length !== 9) miss.push('código NBS (9 dígitos)');
  if (cfg.ibscbs?.enabled && (!digits(cfg.ibscbs.cIndOp) || !digits(cfg.ibscbs.CST) || !digits(cfg.ibscbs.cClassTrib))) miss.push('campos de IBS/CBS');
  return miss;
}

// ---------------- Assinatura XMLDSig (enveloped, C14N, RSA-SHA256) ----------------

/**
 * Monta o documento assinado:
 *   <Root xmlns=NS versao=..><Child Id=..>body</Child><Signature>…</Signature></Root>
 * O digest é calculado sobre <Child> na forma canônica, que inclui o xmlns herdado do pai.
 */
export function signedDocument({ root, child, id, body, key, certB64, version = DPS_VERSION }) {
  const canonChild = `<${child} xmlns="${NS}" Id="${attr(id)}">${body}</${child}>`;
  const digest = createHash('sha256').update(canonChild, 'utf8').digest('base64');
  const signedInfo = (xmlns) =>
    `<SignedInfo${xmlns}><CanonicalizationMethod Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></CanonicalizationMethod>` +
    `<SignatureMethod Algorithm="http://www.w3.org/2001/04/xmldsig-more#rsa-sha256"></SignatureMethod>` +
    `<Reference URI="#${attr(id)}"><Transforms><Transform Algorithm="http://www.w3.org/2000/09/xmldsig#enveloped-signature"></Transform>` +
    `<Transform Algorithm="http://www.w3.org/TR/2001/REC-xml-c14n-20010315"></Transform></Transforms>` +
    `<DigestMethod Algorithm="http://www.w3.org/2001/04/xmlenc#sha256"></DigestMethod><DigestValue>${digest}</DigestValue></Reference></SignedInfo>`;
  const signature = createSign('RSA-SHA256').update(signedInfo(` xmlns="${DSIG}"`), 'utf8').sign(key, 'base64');
  return (
    `<?xml version="1.0" encoding="UTF-8"?><${root} xmlns="${NS}" versao="${version}"><${child} Id="${attr(id)}">${body}</${child}>` +
    `<Signature xmlns="${DSIG}">${signedInfo('')}<SignatureValue>${signature}</SignatureValue>` +
    `<KeyInfo><X509Data><X509Certificate>${certB64}</X509Certificate></X509Data></KeyInfo></Signature></${root}>`
  );
}

export const pack = (xml) => gzipSync(Buffer.from(xml, 'utf8')).toString('base64');
export const unpack = (b64) => (b64 ? gunzipSync(Buffer.from(b64, 'base64')).toString('utf8') : null);

// ---------------- Certificado A1 (.pfx) ----------------

const certCache = new Map(); // integrationId:updatedAt -> { key, cert, certB64, cnpj, validTo }

function openssl(args, env) {
  return new Promise((resolve, reject) =>
    execFile('openssl', args, { env: { ...process.env, ...env }, maxBuffer: 1 << 20 }, (err, stdout, stderr) =>
      err ? reject(new Error(String(stderr || err.message).trim().split('\n')[0])) : resolve(stdout)));
}

const pemBlocks = (pem, label) => pem.match(new RegExp(`-----BEGIN ${label}-----[\\s\\S]+?-----END ${label}-----`, 'g')) || [];

/** Converte o .pfx (base64 + senha) em chave e certificado PEM e confere validade e CNPJ. */
export async function loadCertificate(cacheKey, secret) {
  if (certCache.has(cacheKey)) return certCache.get(cacheKey);
  let pem;
  if (secret.keyPem && secret.certPem) {
    pem = `${secret.keyPem}\n${secret.certPem}`;
  } else {
    if (!secret.pfxB64) throw new Error('certificado A1 não enviado');
    const dir = await mkdtemp(join(tmpdir(), 'iris-cert-'));
    const file = join(dir, 'a1.pfx');
    try {
      await writeFile(file, Buffer.from(secret.pfxB64, 'base64'), { mode: 0o600 });
      const args = ['pkcs12', '-in', file, '-nodes', '-passin', 'env:IRIS_PFX_PASS'];
      const env = { IRIS_PFX_PASS: secret.password || '' };
      // certificados antigos usam algoritmos "legacy" no OpenSSL 3
      pem = await openssl(args, env).catch((e) => (/unsupported|legacy|RC2|Algorithm/i.test(e.message) ? openssl([...args, '-legacy'], env) : Promise.reject(e)));
    } catch (e) {
      throw new Error(/mac verify|password|invalid/i.test(e.message) ? 'senha do certificado incorreta' : `não consegui abrir o certificado (${e.message})`);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
  const keyPem = pemBlocks(pem, 'PRIVATE KEY')[0] || pemBlocks(pem, 'RSA PRIVATE KEY')[0];
  if (!keyPem) throw new Error('o certificado não tem chave privada');
  const key = createPrivateKey(keyPem);
  const certPem = pemBlocks(pem, 'CERTIFICATE').find((c) => new X509Certificate(c).checkPrivateKey(key));
  if (!certPem) throw new Error('não achei o certificado da chave privada no arquivo');
  const x = new X509Certificate(certPem);
  const validTo = new Date(x.validTo);
  if (validTo < new Date()) throw new Error(`certificado vencido em ${validTo.toLocaleDateString('pt-BR')}`);
  // ICP-Brasil: o CNPJ aparece no CN ("RAZAO SOCIAL:12345678000190") ou nas extensões
  const cnpj = (x.subject.match(/:(\d{14})/) || x.subject.match(/(\d{14})/) || [])[1] || null;
  const out = {
    key, keyPem, certPem, cnpj, validTo: validTo.toISOString(), subject: x.subject.split('\n').find((l) => l.startsWith('CN=')) || '',
    certB64: certPem.replace(/-----(BEGIN|END) CERTIFICATE-----|\s/g, ''),
  };
  certCache.set(cacheKey, out);
  return out;
}

// ---------------- HTTP com mTLS ----------------

let transport = null; // testes trocam a rede por uma função
export const setTransport = (fn) => { transport = fn; };

export function client(cfg, cert, { base } = {}) {
  const root = base || BASES[Number(cfg.tpAmb) === 1 ? 1 : 2];
  function call(method, path, body) {
    if (transport) return Promise.resolve(transport(method, path, body, root));
    const url = new URL(root + path);
    const data = body ? JSON.stringify(body) : null;
    return new Promise((resolve, reject) => {
      const req = request(url, {
        method,
        key: cert.keyPem,
        cert: cert.certPem,
        timeout: 60_000,
        headers: { accept: 'application/json', ...(data ? { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data) } : {}) },
      }, (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let json = null;
          try { json = raw ? JSON.parse(raw) : null; } catch { json = { raw: raw.slice(0, 500) }; }
          resolve({ status: res.statusCode, json });
        });
      });
      req.on('timeout', () => req.destroy(new Error('a Sefin Nacional não respondeu em 60 s')));
      req.on('error', reject);
      if (data) req.write(data);
      req.end();
    });
  }
  return {
    emit: (signedXml) => call('POST', '/nfse', { dpsXmlGZipB64: pack(signedXml) }),
    byDps: (id) => call('GET', `/dps/${id}`),
    nfse: (chave) => call('GET', `/nfse/${chave}`),
    event: (chave, signedXml) => call('POST', `/nfse/${chave}/eventos`, { pedidoRegistroEventoXmlGZipB64: pack(signedXml) }),
  };
}

/** Lista de erros da Sefin em texto ("E0014 - descrição (complemento)"). */
export function errorsText(json) {
  const list = json?.erros || json?.Erros || json?.erro || [];
  const arr = Array.isArray(list) ? list : [list];
  const txt = arr.filter(Boolean).map((e) => [e.Codigo || e.codigo, e.Descricao || e.descricao, e.Complemento || e.complemento].filter(Boolean).join(' - ')).join('; ');
  return txt || json?.message || json?.raw || 'resposta sem detalhes';
}

/** Pedido de cancelamento (evento e101101). cMotivo: 1 erro na emissão, 2 serviço não prestado, 9 outros. */
export function cancelEventBody(cfg, { chave, cMotivo = 1, xMotivo }) {
  const doc = digits(cfg.cnpj || cfg.cpf);
  return [
    el('tpAmb', Number(cfg.tpAmb) === 1 ? 1 : 2),
    el('verAplic', APP_VERSION),
    el('dhEvento', nowBr()),
    doc.length === 11 ? el('CPFAutor', doc) : el('CNPJAutor', doc),
    el('chNFSe', chave),
    el('e101101', [el('xDesc', 'Cancelamento de NFS-e'), el('cMotivo', String(cMotivo)), el('xMotivo', String(xMotivo).slice(0, 255))]),
  ].join('');
}
