import { Inngest, EventSchemas } from 'inngest';

type WebAppEvents = {
  'project.file.uploaded': {
    name: 'project.file.uploaded';
    data: {
      fileId: string;
      projectId: string;
      kind: 'viral_patterns' | 'project_info';
      version: number;
    };
  };
};

export const inngest = new Inngest({
  id: 'virus-web',
  schemas: new EventSchemas().fromRecord<WebAppEvents>(),
});
