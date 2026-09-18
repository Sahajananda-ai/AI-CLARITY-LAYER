import { useCallback, useState, type ChangeEvent, type DragEvent } from 'react';
import type { Document, UploadedDocument } from '../../../shared/types/common';
import { Card, Button } from '../../../shared/components';
import { Upload, WandSparkles, FlaskConical } from 'lucide-react';
import { cn } from '../../../shared/utils/cn';
import { UploadedDocumentCard } from './UploadedDocumentCard';
import { createSampleFile, type SampleVariant } from '../validator';

interface DocumentUploadProps {
  document: Document;
  uploadedDoc: UploadedDocument;
  applicantName: string;
  onUpload: (file: File) => void | Promise<void>;
  onRemove: () => void;
  disabled?: boolean;
  busy?: boolean;
}

export function DocumentUpload({
  document,
  uploadedDoc,
  applicantName,
  onUpload,
  onRemove,
  disabled,
  busy,
}: DocumentUploadProps) {
  const [dragActive, setDragActive] = useState(false);

  const handleDrag = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.type === 'dragenter' || event.type === 'dragover') setDragActive(true);
    else if (event.type === 'dragleave') setDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setDragActive(false);
      const file = event.dataTransfer.files?.[0];
      if (file && !disabled) void onUpload(file);
    },
    [onUpload, disabled]
  );

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file && !disabled) void onUpload(file);
    // Allows re-selecting the same file name after a fix.
    event.target.value = '';
  };

  const trySample = (variant: SampleVariant) => {
    if (disabled) return;
    void onUpload(createSampleFile(document, applicantName, variant));
  };

  if (uploadedDoc.fileName) {
    return (
      <UploadedDocumentCard
        document={document}
        uploaded={uploadedDoc}
        applicantName={applicantName}
        onUpload={disabled ? undefined : onUpload}
        onRemove={disabled ? undefined : onRemove}
        busy={busy}
      />
    );
  }

  return (
    <Card
      variant="outlined"
      padding="md"
      className={cn(
        'transition-all duration-200',
        dragActive ? 'border-primary-500 bg-primary-50' : 'border-surface-300 hover:border-primary-300',
        disabled && 'opacity-60'
      )}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
    >
      <input
        type="file"
        id={`upload-${document.id}`}
        accept={document.acceptedTypes.join(',')}
        onChange={handleFileChange}
        className="hidden"
        disabled={disabled}
      />

      <label htmlFor={`upload-${document.id}`} className={cn('block w-full', disabled ? 'cursor-not-allowed' : 'cursor-pointer')}>
        <div className="flex flex-col items-center justify-center px-4 py-6 text-center">
          <div
            className={cn(
              'mb-3 flex h-14 w-14 items-center justify-center rounded-full',
              dragActive ? 'bg-primary-100' : 'bg-surface-100'
            )}
          >
            <Upload className={cn('h-7 w-7', dragActive ? 'text-primary-600' : 'text-surface-400')} />
          </div>
          <p className="mb-1 font-medium text-surface-900">
            {dragActive ? 'Drop it here' : `Upload ${document.name}`}
            {document.required && <span className="ml-1 text-error-500">*</span>}
          </p>
          <p className="text-sm text-surface-500">{document.description}</p>
          {document.hint && <p className="mt-1 text-xs text-surface-400">{document.hint}</p>}
          <p className="mt-2 text-xs text-surface-400">
            {document.acceptedTypes.map(type => type.split('/')[1]?.toUpperCase()).join(', ')} • max {document.maxSizeMB} MB
          </p>
        </div>
      </label>

      <div className="flex flex-wrap items-center justify-center gap-2 border-t border-surface-100 pt-3">
        <span className="text-xs text-surface-500">No file handy?</span>
        <Button type="button" variant="secondary" size="sm" onClick={() => trySample('clean')} disabled={disabled} className="text-xs">
          <WandSparkles className="h-3.5 w-3.5" />
          Use a sample file
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => trySample('flawed')} disabled={disabled} className="text-xs">
          <FlaskConical className="h-3.5 w-3.5" />
          Show a problem
        </Button>
      </div>
    </Card>
  );
}
