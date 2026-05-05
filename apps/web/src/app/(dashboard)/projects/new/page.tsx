import { Metadata } from 'next';
import { ProjectCreateWizard } from './_components/wizard';

export const metadata: Metadata = { title: 'Nuevo proyecto — Virus' };

export default function NewProjectPage() {
  return <ProjectCreateWizard />;
}
