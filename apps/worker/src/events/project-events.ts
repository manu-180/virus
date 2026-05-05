/**
 * Inngest event payloads for project-file lifecycle.
 *
 * `project.file.uploaded` is emitted by the web app after a successful upload to
 * Storage and an INSERT into `project_files`. The worker reacts by parsing.
 *
 * `project.file.parsed` is emitted by the worker once parsing has terminated
 * (either ok or failed); useful for downstream listeners (notifications, UI).
 */

export type ProjectFileKind = 'viral_patterns' | 'project_info';

export interface ProjectFileUploadedEvent {
  name: 'project.file.uploaded';
  data: {
    fileId: string;
    projectId: string;
    kind: ProjectFileKind;
    version: number;
  };
}

export interface ProjectFileParsedEvent {
  name: 'project.file.parsed';
  data: {
    fileId: string;
    projectId: string;
    status: 'ok' | 'failed';
    error?: string;
  };
}

export type ProjectEvents = {
  'project.file.uploaded': ProjectFileUploadedEvent;
  'project.file.parsed': ProjectFileParsedEvent;
};
