import { Close, Image } from '@mui/icons-material';
import { Box, Dialog, IconButton, Tooltip } from '@mui/material';
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
  const [previewImage, setPreviewImage] = useState<string | null>(null);

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

  const createAttachment = useCallback(async (file: File): Promise<Attachment | null> => {
    try {
      // Convert to base64 immediately for persistent display
      const reader = new FileReader();
      const base64 = await new Promise<string>((resolve, reject) => {
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      return {
        type: 'image',
        file,
        url: base64, // Use base64 as URL
        base64,
        mimeType: file.type,
        size: file.size,
        name: file.name,
      };
    } catch (error) {
      console.error('Failed to convert file to base64:', file.name, error);
      return null;
    }
  }, []);

  const handleFiles = useCallback(
    async (files: FileList | null) => {
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

      // Process files sequentially to convert to base64
      for (const file of filesToAdd) {
        const validation = validateFile(file);
        if (validation.valid) {
          // eslint-disable-next-line no-await-in-loop
          const attachment = await createAttachment(file);
          if (attachment) {
            newAttachments.push(attachment);
          } else {
            errors.push(`${file.name}: Failed to create preview`);
          }
        } else if (validation.error) {
          errors.push(`${file.name}: ${validation.error}`);
        }
      }

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
      sx={{
        display: 'flex',
        alignItems: 'center',
        gap: 1.5,
        flexWrap: 'nowrap',
        position: 'relative',
      }}
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
        <Tooltip key={attachment.url} title={attachment.name || `Image ${index + 1}`} placement="top" arrow>
          <Box
            onClick={() => setPreviewImage(attachment.url)}
            sx={{
              position: 'relative',
              width: 48,
              height: 48,
              borderRadius: 1.5,
              overflow: 'visible', // Allow close button to overflow
              border: '2px solid',
              borderColor: 'divider',
              transition: 'all 0.2s ease',
              flexShrink: 0,
              cursor: 'pointer',
              '&:hover': {
                borderColor: 'primary.main',
                boxShadow: '0 2px 12px rgba(0, 0, 0, 0.2)',
                transform: 'scale(1.05)',
                '& .close-button': {
                  opacity: 1,
                },
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
                borderRadius: 1,
                pointerEvents: 'none', // Let parent handle click
              }}
            />
            <IconButton
              className="close-button"
              size="small"
              onClick={(e) => {
                e.stopPropagation();
                removeAttachment(index);
              }}
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
                opacity: 0.9,
                boxShadow: '0 2px 6px rgba(0, 0, 0, 0.3)',
                transition: 'all 0.2s ease',
                zIndex: 1, // Ensure button is above image
                '&:hover': {
                  bgcolor: 'error.dark',
                  opacity: 1,
                  transform: 'scale(1.15)',
                },
              }}>
              <Close sx={{ fontSize: 14 }} />
            </IconButton>
          </Box>
        </Tooltip>
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

      {/* Image preview dialog */}
      <Dialog
        open={!!previewImage}
        onClose={() => setPreviewImage(null)}
        maxWidth="lg"
        PaperProps={{
          sx: {
            bgcolor: 'transparent',
            boxShadow: 'none',
            overflow: 'visible',
          },
        }}
        sx={{
          '& .MuiBackdrop-root': {
            bgcolor: 'rgba(0, 0, 0, 0.85)',
          },
        }}>
        <Box
          sx={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            minWidth: 300,
            minHeight: 300,
            maxWidth: '90vw',
            maxHeight: '90vh',
          }}>
          <Box
            component="img"
            src={previewImage || ''}
            alt="Preview"
            sx={{
              maxWidth: '100%',
              maxHeight: '90vh',
              objectFit: 'contain',
              borderRadius: 2,
              boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
            }}
          />
          <IconButton
            onClick={() => setPreviewImage(null)}
            sx={{
              position: 'absolute',
              top: -16,
              right: -16,
              bgcolor: 'background.paper',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
              '&:hover': {
                bgcolor: 'error.main',
                color: 'white',
              },
            }}>
            <Close />
          </IconButton>
        </Box>
      </Dialog>
    </Box>
  );
}
