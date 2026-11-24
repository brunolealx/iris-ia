import { Suspense } from 'react';
import { EntrarForm } from './form';

export default function Entrar() {
  return (
    <Suspense>
      <EntrarForm />
    </Suspense>
  );
}
