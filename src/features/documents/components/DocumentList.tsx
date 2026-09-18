import type { Document, UploadedDocument } from '../../../shared/types/common';
import { DocumentUpload } from './DocumentUpload';
import { Badge } from '../../../shared/components';
import { cn } from '../../../shared/utils/cn';

interface DocumentListProps {
  documents: Document[];
  uploadedDocs: UploadedDocument[];
  applicantName: string;
  onUpload: (docId: string, file: File) => void | Promise<void>;
  onRemove: (docId: string) => void;
  disabled?: boolean;
  /** documentId currently being reviewed, so only that card shows a spinner. */
  busyDocumentId?: string | null;
}

export function DocumentList({
  documents,
  uploadedDocs,
  applicantName,
  onUpload,
  onRemove,
  disabled,
  busyDocumentId,
}: DocumentListProps) {
  const requiredDocs = documents.filter(doc => doc.required);
  const optionalDocs = documents.filter(doc => !doc.required);
  const findUploaded = (id: string) => uploadedDocs.find(doc => doc.documentId === id);

  const requiredVerified = requiredDocs.filter(doc => findUploaded(doc.id)?.status === 'pass').length;
  const failures = uploadedDocs.filter(doc => doc.fileName && doc.status === 'fail');
  const warnings = uploadedDocs.filter(doc => doc.fileName && doc.status === 'warning');
  const missing = requiredDocs.filter(doc => !findUploaded(doc.id)?.fileName);
  const allRequiredVerified = requiredVerified === requiredDocs.length;

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold text-surface-900">Required documents</h3>
            <p className="text-sm text-surface-500">
              {requiredVerified} of {requiredDocs.length} verified
              {missing.length > 0 && ` • ${missing.length} still to upload`}
            </p>
          </div>
          <Badge variant={allRequiredVerified ? 'success' : failures.length > 0 ? 'error' : 'warning'} dot>
            {allRequiredVerified
              ? 'All verified'
              : failures.length > 0
                ? `${failures.length} ${failures.length === 1 ? 'needs' : 'need'} fixing`
                : 'In progress'}
          </Badge>
        </div>

        <div className="space-y-3">
          {requiredDocs.map(doc => {
            const uploaded = findUploaded(doc.id);
            return (
              <DocumentUpload
                key={doc.id}
                document={doc}
                applicantName={applicantName}
                uploadedDoc={
                  uploaded ?? {
                    id: `upload-${doc.id}`,
                    documentId: doc.id,
                    fileName: '',
                    fileSize: 0,
                    fileType: '',
                    uploadedAt: new Date(),
                    status: 'pending',
                  }
                }
                onUpload={file => onUpload(doc.id, file)}
                onRemove={() => onRemove(doc.id)}
                disabled={disabled}
                busy={busyDocumentId === doc.id}
              />
            );
          })}
        </div>
      </section>

      {optionalDocs.length > 0 && (
        <section>
          <div className="mb-3">
            <h3 className="text-lg font-semibold text-surface-900">Optional documents</h3>
            <p className="text-sm text-surface-500">These speed up underwriting but are not needed to submit.</p>
          </div>
          <div className="space-y-3">
            {optionalDocs.map(doc => {
              const uploaded = findUploaded(doc.id);
              return (
                <DocumentUpload
                  key={doc.id}
                  document={doc}
                  applicantName={applicantName}
                  uploadedDoc={
                    uploaded ?? {
                      id: `upload-${doc.id}`,
                      documentId: doc.id,
                      fileName: '',
                      fileSize: 0,
                      fileType: '',
                      uploadedAt: new Date(),
                      status: 'pending',
                    }
                  }
                  onUpload={file => onUpload(doc.id, file)}
                  onRemove={() => onRemove(doc.id)}
                  disabled={disabled}
                  busy={busyDocumentId === doc.id}
                />
              );
            })}
          </div>
        </section>
      )}

      {uploadedDocs.some(doc => doc.fileName) && (
        <section className="grid grid-cols-3 gap-3">
          <div className={cn('rounded-lg p-3 text-center', requiredVerified === requiredDocs.length ? 'bg-success-50' : 'bg-warning-50')}>
            <div className={cn('text-2xl font-bold', requiredVerified === requiredDocs.length ? 'text-success-600' : 'text-warning-600')}>
              {requiredVerified}
            </div>
            <div className="text-xs text-surface-600">Verified</div>
          </div>
          <div className={cn('rounded-lg p-3 text-center', warnings.length ? 'bg-warning-50' : 'bg-surface-100')}>
            <div className={cn('text-2xl font-bold', warnings.length ? 'text-warning-600' : 'text-surface-400')}>{warnings.length}</div>
            <div className="text-xs text-surface-600">Review advised</div>
          </div>
          <div className={cn('rounded-lg p-3 text-center', failures.length ? 'bg-error-50' : 'bg-surface-100')}>
            <div className={cn('text-2xl font-bold', failures.length ? 'text-error-600' : 'text-surface-400')}>{failures.length}</div>
            <div className="text-xs text-surface-600">Need fixing</div>
          </div>
        </section>
      )}
    </div>
  );
}
