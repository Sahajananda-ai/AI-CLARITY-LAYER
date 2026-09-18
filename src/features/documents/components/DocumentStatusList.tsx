import type { Document, UploadedDocument } from '../../../shared/types/common';
import { UploadedDocumentCard } from './UploadedDocumentCard';
import { CircleDot } from 'lucide-react';

interface DocumentStatusListProps {
  /** Requirement metadata for the active journey. */
  documents: Document[];
  uploadedDocs: UploadedDocument[];
  applicantName: string;
}

/**
 * Read-only companion to the upload flow, used on the dashboard where the
 * applicant is tracking progress rather than uploading. Unlike the wizard it
 * never renders an empty dropzone for a document that was never uploaded.
 */
export function DocumentStatusList({ documents, uploadedDocs, applicantName }: DocumentStatusListProps) {
  const required = documents.filter(doc => doc.required);
  const uploaded = uploadedDocs.filter(doc => doc.fileName);
  const missing = required.filter(doc => !uploadedDocs.find(item => item.documentId === doc.id && item.fileName));

  return (
    <div className="space-y-3">
      {uploaded.map(item => {
        const requirement = documents.find(doc => doc.id === item.documentId) ?? {
          id: item.documentId,
          name: item.documentId,
          required: true,
          acceptedTypes: [],
          maxSizeMB: 5,
          description: '',
        };
        return (
          <UploadedDocumentCard
            key={item.id}
            document={requirement}
            uploaded={item}
            applicantName={applicantName}
            hideSampleActions
          />
        );
      })}

      {missing.map(doc => (
        <div key={doc.id} className="flex items-center gap-3 rounded-xl border border-dashed border-surface-300 bg-surface-50 p-4">
          <CircleDot className="h-4 w-4 flex-shrink-0 text-surface-400" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-surface-700">{doc.name}</p>
            <p className="text-xs text-surface-500">Not uploaded — go back to the upload step to add it.</p>
          </div>
        </div>
      ))}
    </div>
  );
}
