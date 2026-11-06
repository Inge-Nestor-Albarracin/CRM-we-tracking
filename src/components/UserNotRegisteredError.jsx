import React from 'react';
import { ShieldAlert } from 'lucide-react';
import AuthLayout from '@/components/AuthLayout';

const UserNotRegisteredError = () => {
  return (
    <AuthLayout
      icon={ShieldAlert}
      title="Acceso restringido"
      subtitle="Tu cuenta no está registrada en el CRM de WeTracking."
    >
      <div className="p-4 bg-muted rounded-2xl text-sm text-muted-foreground">
        <p>Si crees que es un error, puedes:</p>
        <ul className="list-disc list-inside mt-2 space-y-1">
          <li>Verificar que entraste con la cuenta correcta</li>
          <li>Pedirle acceso al administrador del CRM</li>
          <li>Cerrar sesión y volver a entrar</li>
        </ul>
      </div>
    </AuthLayout>
  );
};

export default UserNotRegisteredError;
