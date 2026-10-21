"use client";

import React, { useState, useEffect } from "react";
import ReactQuill from "react-quill-new";
import "react-quill-new/dist/quill.snow.css";

interface RichTextEditorProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  [key: string]: any;
}

const RichTextEditor = React.forwardRef<HTMLDivElement, RichTextEditorProps>(
  ({ value = "", onChange, disabled, className, ...props }, ref) => {
    const [content, setContent] = useState(value);

    useEffect(() => {
      setContent(value);
    }, [value]);

    const handleChange = (newContent: string) => {
      setContent(newContent);
      if (onChange) {
        onChange(newContent);
      }
    };

    // Quill modules configuration
    const modules = {
      toolbar: [
        [{ header: [1, 2, 3, false] }],
        ["bold", "italic", "underline", "strike"],
        [{ list: "ordered" }, { list: "bullet" }],
        [{ indent: "-1" }, { indent: "+1" }],
        [{ align: [] }],
        ["link"],
        ["clean"],
      ],
    };

    // Quill formats configuration
    const formats = [
      "header",
      "bold",
      "italic",
      "underline",
      "strike",
      "list",
      "indent",
      "align",
      "link",
    ];

    return (
      <div ref={ref} className={className}>
        <ReactQuill
          theme="snow"
          value={content}
          onChange={handleChange}
          modules={modules}
          formats={formats}
          readOnly={disabled}
          {...props}
        />
      </div>
    );
  }
);

RichTextEditor.displayName = "RichTextEditor";

export { RichTextEditor };
