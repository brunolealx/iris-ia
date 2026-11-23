// Estrutura da planilha "Iris — Gestão" criada no Google Drive do cliente.
// Colunas calculadas ficam por último e usam ARRAYFORMULA na linha 2, para que
// as linhas que a Iris acrescenta já saiam calculadas.
// Fórmulas pela API são sempre em inglês com vírgula (a planilha mostra em pt-BR).

/** Estrutura de pastas criada no Drive do cliente (a planilha fica na raiz). */
export const FOLDERS = [
  'Notas Fiscais',          // XML das NF-e (subpastas por ano/mês, criadas sob demanda)
  'Vendas',                 // comprovantes, pedidos, etiquetas
  'Funcionários',           // contratos, documentos, holerites
  'Financeiro',             // boletos, comprovantes de pagamento, extratos
  'Produtos',               // fotos, fichas técnicas
  'Fornecedores',           // catálogos, contratos
  'Contratos',
  'Relatórios',             // relatórios mensais gerados pela Iris
  'Marketing',
];

const af = (expr) => `=ARRAYFORMULA(${expr})`;

export const TABS = [
  {
    title: 'Painel', color: '#22c55e',
    rows: [
      ['IRIS — PAINEL DA EMPRESA', ''],
      ['Indicador', 'Valor'],
      ['Faturamento do mês', '=SUMIFS(Vendas!H:H,Vendas!A:A,">="&(EOMONTH(TODAY(),-1)+1),Vendas!I:I,"<>Cancelado")'],
      ['Pedidos do mês', '=COUNTIFS(Vendas!A:A,">="&(EOMONTH(TODAY(),-1)+1),Vendas!I:I,"<>Cancelado")'],
      ['Ticket médio', '=IFERROR(B3/B4,0)'],
      ['Comissões do mês', '=SUMIFS(Vendas!N:N,Vendas!A:A,">="&(EOMONTH(TODAY(),-1)+1))'],
      ['Folha do mês (líquido)', '=SUMIFS(\'Folha de Pagamento\'!M:M,\'Folha de Pagamento\'!A:A,TEXT(TODAY(),"yyyy-mm"))'],
      ['Contas a pagar em aberto', '=SUMIFS(\'Contas a Pagar\'!E:E,\'Contas a Pagar\'!G:G,"<>Pago")'],
      ['Contas a pagar atrasadas', '=SUMIFS(\'Contas a Pagar\'!E:E,\'Contas a Pagar\'!G:G,"Atrasado")'],
      ['Contas a receber em aberto', '=SUMIFS(\'Contas a Receber\'!D:D,\'Contas a Receber\'!F:F,"<>Recebido")'],
      ['Saldo de caixa', "=SUM('Fluxo de Caixa'!F:F)"],
      ['Produtos para repor', '=COUNTIF(Produtos!J:J,"REPOR")'],
      ['Funcionários ativos', '=COUNTIF(Funcionários!K:K,"Ativo")'],
      ['Folgas/férias hoje', "=COUNTIFS('Folgas e Férias'!D:D,\"<=\"&TODAY(),'Folgas e Férias'!E:E,\">=\"&TODAY())"],
    ],
    currency: ['B3', 'B5', 'B6', 'B7', 'B8', 'B9', 'B10', 'B11'],
  },
  {
    title: 'Vendas', color: '#16a34a',
    headers: ['Data', 'Pedido', 'Canal', 'Cliente', 'Produtos', 'Qtd', 'Valor unit.', 'Total', 'Status', 'Vendedor', 'NF-e', 'Observações', 'Comissão %', 'Comissão R$'],
    formulas: { N2: af('IF(H2:H="",,H2:H*IF(M2:M="",IFERROR(VLOOKUP(J2:J,{Funcionários!B2:B,Funcionários!M2:M},2,FALSE),0),M2:M))') },
    money: ['G', 'H', 'N'], dates: ['A'], percent: ['M'],
    lists: { C: ['Mercado Livre', 'WhatsApp', 'Loja física', 'Site', 'Outro'], I: ['Pago', 'Enviado', 'Entregue', 'Cancelado', 'Pendente'] },
  },
  {
    title: 'Produtos', color: '#15803d',
    headers: ['SKU', 'Nome', 'Categoria', 'Custo', 'Preço', 'Estoque', 'Estoque mínimo', 'Fornecedor', 'Origem', 'Repor?', 'Margem %'],
    formulas: {
      J2: af('IF(B2:B="",,IF(F2:F<=G2:G,"REPOR",""))'),
      K2: af('IF((B2:B="")+(E2:E=0),,(E2:E-D2:D)/E2:E)'),
    },
    money: ['D', 'E'], percent: ['K'],
  },
  {
    title: 'Clientes', color: '#166534',
    headers: ['Nome', 'Telefone', 'E-mail', 'Canal', 'Etapa', 'Cidade', 'Cadastro', 'Observações', 'Total comprado', 'Pedidos'],
    formulas: {
      I2: af('IF(A2:A="",,SUMIFS(Vendas!H:H,Vendas!D:D,A2:A,Vendas!I:I,"<>Cancelado"))'),
      J2: af('IF(A2:A="",,COUNTIFS(Vendas!D:D,A2:A,Vendas!I:I,"<>Cancelado"))'),
    },
    money: ['I'], dates: ['G'],
    lists: { E: ['Lead', 'Negociação', 'Cliente', 'Pós-venda', 'Perdido'] },
  },
  {
    title: 'Funcionários', color: '#0f766e',
    headers: ['Matrícula', 'Nome', 'CPF', 'Cargo', 'Setor', 'Admissão', 'Salário base', 'Telefone', 'E-mail', 'Chave PIX', 'Status', 'Folga semanal', 'Comissão %'],
    money: ['G'], dates: ['F'], percent: ['M'],
    lists: { K: ['Ativo', 'Afastado', 'Férias', 'Desligado'], L: ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo', 'Escala'] },
  },
  {
    title: 'Folha de Pagamento', color: '#115e59',
    note: 'INSS e IRRF mudam todo ano: preencha os valores calculados pelo seu contador. FGTS (8%) é calculado automaticamente.',
    headers: ['Mês (aaaa-mm)', 'Matrícula', 'Horas extras R$', 'Bônus R$', 'Faltas R$', 'INSS R$', 'IRRF R$', 'Vale-transporte R$', 'Outros descontos R$', 'Pago em', 'Status', 'Nome', 'Líquido', 'Salário base', 'Comissões', 'FGTS 8%'],
    formulas: {
      L2: af('IF(B2:B="",,IFERROR(VLOOKUP(B2:B,Funcionários!A2:B,2,FALSE),"?"))'),
      N2: af('IF(B2:B="",,IFERROR(VLOOKUP(B2:B,Funcionários!A2:G,7,FALSE),0))'),
      O2: af('IF(B2:B="",,SUMIFS(Vendas!N:N,Vendas!J:J,L2:L,Vendas!A:A,">="&DATEVALUE(A2:A&"-01"),Vendas!A:A,"<="&EOMONTH(DATEVALUE(A2:A&"-01"),0)))'),
      M2: af('IF(B2:B="",,N2:N+C2:C+D2:D+O2:O-E2:E-F2:F-G2:G-H2:H-I2:I)'),
      P2: af('IF(B2:B="",,(N2:N+C2:C+D2:D+O2:O-E2:E)*0.08)'),
    },
    money: ['C', 'D', 'E', 'F', 'G', 'H', 'I', 'M', 'N', 'O', 'P'], dates: ['J'],
    lists: { K: ['A pagar', 'Pago'] },
  },
  {
    title: 'Folgas e Férias', color: '#134e4a',
    headers: ['Matrícula', 'Nome', 'Tipo', 'Início', 'Fim', 'Aprovado por', 'Observação', 'Dias'],
    formulas: { H2: af('IF((D2:D="")+(E2:E=""),,E2:E-D2:D+1)') },
    dates: ['D', 'E'],
    lists: { C: ['Folga', 'Férias', 'Atestado', 'Falta', 'Banco de horas'] },
  },
  {
    title: 'Contas a Pagar', color: '#ca8a04',
    headers: ['Vencimento', 'Descrição', 'Fornecedor', 'Categoria', 'Valor', 'Pago em', 'Status'],
    formulas: { G2: af('IF(A2:A="",,IF(F2:F<>"","Pago",IF(A2:A<TODAY(),"Atrasado","Aberto")))') },
    money: ['E'], dates: ['A', 'F'],
    lists: { D: ['Fornecedor', 'Aluguel', 'Salários', 'Impostos', 'Marketing', 'Frete', 'Tarifas ML', 'Outros'] },
  },
  {
    title: 'Contas a Receber', color: '#a16207',
    headers: ['Vencimento', 'Descrição', 'Cliente', 'Valor', 'Recebido em', 'Status'],
    formulas: { F2: af('IF(A2:A="",,IF(E2:E<>"","Recebido",IF(A2:A<TODAY(),"Atrasado","Aberto")))') },
    money: ['D'], dates: ['A', 'E'],
  },
  {
    title: 'Fluxo de Caixa', color: '#854d0e',
    headers: ['Data', 'Descrição', 'Tipo', 'Categoria', 'Valor', 'Valor (±)', 'Saldo'],
    formulas: {
      F2: af('IF(E2:E="",,IF(C2:C="Saída",-E2:E,E2:E))'),
      G2: af('IF(E2:E="",,SUMIF(ROW(F2:F),"<="&ROW(F2:F),F2:F))'),
    },
    money: ['E', 'F', 'G'], dates: ['A'],
    lists: { C: ['Entrada', 'Saída'] },
  },
  {
    title: 'Fornecedores', color: '#713f12',
    headers: ['Nome', 'CNPJ', 'Contato', 'Telefone', 'E-mail', 'Produtos', 'Prazo de entrega', 'Observações'],
  },
];

const col = (letter) => letter.charCodeAt(0) - 65;
const rgb = (hex) => ({ red: parseInt(hex.slice(1, 3), 16) / 255, green: parseInt(hex.slice(3, 5), 16) / 255, blue: parseInt(hex.slice(5, 7), 16) / 255 });

/** Corpo para criar a planilha (abas, cores, linha congelada). */
export function createBody(companyName) {
  return {
    properties: { title: `Iris — Gestão ${companyName}`, locale: 'pt_BR', timeZone: 'America/Sao_Paulo' },
    sheets: TABS.map((t, i) => ({
      properties: { sheetId: i, index: i, title: t.title, tabColor: rgb(t.color), gridProperties: { frozenRowCount: t.headers ? 1 : 2, rowCount: 1000, columnCount: Math.max(t.headers?.length || 2, 8) } },
    })),
  };
}

/** Cabeçalhos e fórmulas (values:batchUpdate). */
export function valuesData() {
  const data = [];
  for (const t of TABS) {
    const q = `'${t.title}'`;
    if (t.rows) data.push({ range: `${q}!A1`, values: t.rows });
    if (t.headers) data.push({ range: `${q}!A1`, values: [t.headers] });
    for (const [cell, f] of Object.entries(t.formulas || {})) data.push({ range: `${q}!${cell}`, values: [[f]] });
  }
  return data;
}

/** Formatação: cabeçalho preto/verde, moeda, data, %, listas suspensas, notas. */
export function formatRequests() {
  const reqs = [];
  TABS.forEach((t, sheetId) => {
    const headerRow = t.headers ? 0 : 1;
    const width = t.headers?.length || 2;
    reqs.push({
      repeatCell: {
        range: { sheetId, startRowIndex: headerRow, endRowIndex: headerRow + 1, startColumnIndex: 0, endColumnIndex: width },
        cell: { userEnteredFormat: { backgroundColor: rgb('#0a0a0a'), textFormat: { bold: true, foregroundColor: rgb('#22c55e') }, horizontalAlignment: 'CENTER' } },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
      },
    });
    const fmt = (letters, numberFormat) =>
      (letters || []).forEach((l) =>
        reqs.push({
          repeatCell: {
            range: { sheetId, startRowIndex: headerRow + 1, startColumnIndex: col(l), endColumnIndex: col(l) + 1 },
            cell: { userEnteredFormat: { numberFormat } },
            fields: 'userEnteredFormat.numberFormat',
          },
        })
      );
    fmt(t.money, { type: 'CURRENCY', pattern: '"R$" #,##0.00' });
    fmt(t.dates, { type: 'DATE', pattern: 'dd/mm/yyyy' });
    fmt(t.percent, { type: 'PERCENT', pattern: '0.0%' });
    for (const [l, values] of Object.entries(t.lists || {})) {
      reqs.push({
        setDataValidation: {
          range: { sheetId, startRowIndex: 1, startColumnIndex: col(l), endColumnIndex: col(l) + 1 },
          rule: { condition: { type: 'ONE_OF_LIST', values: values.map((v) => ({ userEnteredValue: v })) }, showCustomUi: true, strict: false },
        },
      });
    }
    if (t.note) {
      reqs.push({ updateCells: { range: { sheetId, startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 }, rows: [{ values: [{ note: t.note }] }], fields: 'note' } });
    }
    if (t.currency) {
      for (const cell of t.currency) {
        const r = Number(cell.slice(1)) - 1;
        reqs.push({
          repeatCell: {
            range: { sheetId, startRowIndex: r, endRowIndex: r + 1, startColumnIndex: 1, endColumnIndex: 2 },
            cell: { userEnteredFormat: { numberFormat: { type: 'CURRENCY', pattern: '"R$" #,##0.00' } } },
            fields: 'userEnteredFormat.numberFormat',
          },
        });
      }
    }
    reqs.push({ autoResizeDimensions: { dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: width } } });
  });
  return reqs;
}

// ---------- Linhas que a Iris acrescenta ----------
const day = (d) => new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const money = (cents) => (Number(cents || 0) / 100).toFixed(2);
const CHANNEL = { mercadolivre: 'Mercado Livre', whatsapp: 'WhatsApp', api: 'Site', manual: 'Outro' };
const STATUS = { paid: 'Pago', shipped: 'Enviado', delivered: 'Entregue', cancelled: 'Cancelado' };
const STAGE = { lead: 'Lead', negociacao: 'Negociação', cliente: 'Cliente', pos_venda: 'Pós-venda', perdido: 'Perdido' };

/** Vendas!A:L (sem as colunas calculadas). */
export function orderRow(o, contactName) {
  const items = o.items || [];
  const qty = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  return [
    day(o.created_at), o.external_id, CHANNEL[o.source] || o.source, contactName || o.buyer?.name || o.buyer?.nickname || '',
    items.map((i) => `${i.quantity}x ${i.title}`).join('; '), qty,
    items.length === 1 ? Number(items[0].unitPrice || 0).toFixed(2) : '', money(o.total_cents),
    STATUS[o.status] || o.status, '', o.nfe_key || '', '',
  ];
}

/** Clientes!A:H */
export function contactRow(c) {
  return [c.name || '', c.phone || '', c.email || '', CHANNEL[c.channel] || c.channel, STAGE[c.stage] || c.stage, '', day(c.created_at), ''];
}

/** Produtos!A:I */
export function productRow(p) {
  return [p.sku || p.external_id, p.name, '', '', p.price_cents != null ? money(p.price_cents) : '', p.stock ?? '', '', '', p.source];
}
