import React, { useState } from 'react';
import { Upload, X } from 'lucide-react';

interface ImagePickerProps {
  value?: string;
  onChange?: (url: string | null) => void;
  disabled?: boolean;
}

export const ImagePicker: React.FC<ImagePickerProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const [preview, setPreview] = useState<string | null>(value || null);
  const [file, setFile] = useState<File | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result as string;
        setPreview(result);
        onChange?.(result);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleRemove = () => {
    setFile(null);
    setPreview(null);
    onChange?.('');
  };

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-gray-700">Photo</label>
      <div className="flex items-center gap-4">
        {preview ? (
          <div className="relative">
            <img
              src={preview}
              alt="Preview"
              className="w-24 h-24 object-cover rounded-lg border border-gray-200"
            />
            <button
              type="button"
              onClick={handleRemove}
              disabled={disabled}
              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 disabled:opacity-50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <div className="w-24 h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center bg-gray-50">
            <Upload className="w-8 h-8 text-gray-400" />
          </div>
        )}
        <div>
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            disabled={disabled}
            className="hidden"
            id="image-input"
          />
          <label
            htmlFor="image-input"
            className="inline-flex items-center px-4 py-2 bg-white border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
          >
            {preview ? 'Change Photo' : 'Upload Photo'}
          </label>
          <p className="mt-1 text-xs text-gray-500">
            SVG, PNG, JPG or GIF (max. 5MB)
          </p>
        </div>
      </div>
    </div>
  );
};
