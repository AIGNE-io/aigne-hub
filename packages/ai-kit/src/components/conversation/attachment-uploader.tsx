import { Close, Image } from '@mui/icons-material';
import { Box, IconButton, Tooltip } from '@mui/material';
import { useCallback, useState } from 'react';

import { Attachment, ModelCapabilities } from '../../api/types';

export interface AttachmentUploaderProps {
  onAttachmentsChange: (attachments: Attachment[]) => void;
  modelCapabilities?: ModelCapabilities | null;
  disabled?: boolean;
  maxFiles?: number;
  maxFileSize?: number; // in bytes
}

const DEFAULT_MAX_FILES = 10;
const DEFAULT_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const SUPPORTED_IMAGE_FORMATS = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];

export default function AttachmentUploader({
  onAttachmentsChange,
  modelCapabilities = null,
  disabled = false,
  maxFiles = DEFAULT_MAX_FILES,
  maxFileSize = DEFAULT_MAX_FILE_SIZE,
}: AttachmentUploaderProps) {
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [dragActive, setDragActive] = useState(false);

  // Check if vision is supported
  const isVisionSupported = modelCapabilities?.vision ?? false;
  const isDisabled = disabled || !isVisionSupported;

  // Get max image count from model capabilities
  const effectiveMaxFiles = modelCapabilities?.maxImageCount
    ? Math.min(maxFiles, modelCapabilities.maxImageCount)
    : maxFiles;

  const validateFile = useCallback(
    (file: File): { valid: boolean; error?: string } => {
      // Check file type
      if (!SUPPORTED_IMAGE_FORMATS.includes(file.type)) {
        return {
          valid: false,
          error: `Unsupported file format: ${file.type}. Supported formats: JPEG, PNG, GIF, WEBP`,
        };
      }

      // Check file size
      if (file.size > maxFileSize) {
        return {
          valid: false,
          error: `File size exceeds ${Math.round(maxFileSize / 1024 / 1024)}MB limit`,
        };
      }

      return { valid: true };
    },
    [maxFileSize]
  );

  const createAttachment = useCallback((file: File): Attachment | null => {
    try {
      const url = URL.createObjectURL(file);
      return {
        type: 'image',
        file,
        url,
        mimeType: file.type,
        size: file.size,
        name: file.name,
      };
    } catch (error) {
      console.error('Failed to create object URL for file:', file.name, error);
      return null;
    }
  }, []);

  const handleFiles = useCallback(
    (files: FileList | null) => {
      if (!files || isDisabled) return;

      const fileArray = Array.from(files);
      const remainingSlots = effectiveMaxFiles - attachments.length;

      if (remainingSlots <= 0) {
        alert(`Maximum ${effectiveMaxFiles} images allowed`);
        return;
      }

      const filesToAdd = fileArray.slice(0, remainingSlots);
      const newAttachments: Attachment[] = [];
      const errors: string[] = [];

      filesToAdd.forEach((file) => {
        const validation = validateFile(file);
        if (validation.valid) {
          const attachment = createAttachment(file);
          if (attachment) {
            newAttachments.push(attachment);
          } else {
            errors.push(`${file.name}: Failed to create preview`);
          }
        } else if (validation.error) {
          errors.push(`${file.name}: ${validation.error}`);
        }
      });

      if (errors.length > 0) {
        alert(`Some files could not be added:\n${errors.join('\n')}`);
      }

      if (newAttachments.length > 0) {
        const updatedAttachments = [...attachments, ...newAttachments];
        setAttachments(updatedAttachments);
        onAttachmentsChange(updatedAttachments);
      }
    },
    [attachments, createAttachment, effectiveMaxFiles, isDisabled, onAttachmentsChange, validateFile]
  );

  const removeAttachment = useCallback(
    (index: number) => {
      // Revoke object URL to prevent memory leak
      const attachment = attachments[index];
      if (attachment) {
        URL.revokeObjectURL(attachment.url);
      }

      const newAttachments = attachments.filter((_, i) => i !== index);
      setAttachments(newAttachments);
      onAttachmentsChange(newAttachments);
    },
    [attachments, onAttachmentsChange]
  );

  const handleDrag = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (isDisabled) return;

      if (e.type === 'dragenter' || e.type === 'dragover') {
        setDragActive(true);
      } else if (e.type === 'dragleave') {
        setDragActive(false);
      }
    },
    [isDisabled]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (isDisabled) return;
      handleFiles(e.dataTransfer.files);
    },
    [handleFiles, isDisabled]
  );

  const getTooltipTitle = () => {
    if (!isVisionSupported) {
      return "Current model doesn't support image input";
    }
    if (attachments.length >= effectiveMaxFiles) {
      return `Maximum ${effectiveMaxFiles} images reached`;
    }
    return 'Upload images';
  };

  return (
    <Box
      sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}>
      <Tooltip title={getTooltipTitle()} placement="top">
        <span>
          <IconButton
            component="label"
            size="small"
            disabled={isDisabled || attachments.length >= effectiveMaxFiles}
            sx={{
              color: dragActive ? 'primary.main' : 'text.secondary',
              transition: 'all 0.2s ease',
              '&:hover': {
                color: 'primary.main',
                bgcolor: 'action.hover',
              },
              '&.Mui-disabled': {
                color: 'action.disabled',
              },
            }}>
            <Image fontSize="small" />
            <input
              type="file"
              hidden
              multiple
              accept={SUPPORTED_IMAGE_FORMATS.join(',')}
              onChange={(e) => handleFiles(e.target.files)}
              disabled={isDisabled}
            />
          </IconButton>
        </span>
      </Tooltip>

      {/* Preview thumbnails */}
      {attachments.map((attachment, index) => (
        <Box
          key={attachment.url}
          sx={{
            position: 'relative',
            width: 40,
            height: 40,
            borderRadius: 1,
            overflow: 'hidden',
            border: '1px solid',
            borderColor: 'divider',
            transition: 'all 0.2s ease',
            flexShrink: 0,
            '&:hover': {
              borderColor: 'primary.main',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
            },
          }}>
          <Box
            component="img"
            src={attachment.url}
            alt={attachment.name || `Image ${index + 1}`}
            loading="lazy"
            onError={(e) => {
              console.error('Failed to load image:', attachment.name);
              (e.target as HTMLImageElement).style.display = 'none';
            }}
            sx={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: 'block',
            }}
          />
          <IconButton
            size="small"
            onClick={() => removeAttachment(index)}
            sx={{
              position: 'absolute',
              top: -6,
              right: -6,
              width: 20,
              height: 20,
              bgcolor: 'error.main',
              color: 'white',
              p: 0,
              minWidth: 'unset',
              '&:hover': {
                bgcolor: 'error.dark',
              },
            }}>
            <Close sx={{ fontSize: 14 }} />
          </IconButton>
        </Box>
      ))}

      {/* Drag overlay hint */}
      {dragActive && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            bgcolor: 'rgba(25, 118, 210, 0.1)',
            backdropFilter: 'blur(2px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            pointerEvents: 'none',
          }}>
          <Box
            sx={{
              p: 4,
              bgcolor: 'background.paper',
              borderRadius: 2,
              border: '2px dashed',
              borderColor: 'primary.main',
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.1)',
            }}>
            <Image sx={{ fontSize: 48, color: 'primary.main', mb: 1 }} />
            <Box sx={{ fontSize: 16, fontWeight: 500, color: 'text.primary' }}>Drop images here</Box>
          </Box>
        </Box>
      )}
    </Box>
  );
}
