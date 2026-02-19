import * as React from "react";
import { RichTextEditor } from "./rich-text-editor";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  quill?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement | HTMLDivElement, TextareaProps>(
  ({ className, quill = false, ...props }, ref) => {
    if (quill) {
      return <RichTextEditor ref={ref as React.Ref<HTMLDivElement>} {...props} />;
    }

    return (
      <textarea
        className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        ref={ref as React.Ref<HTMLTextAreaElement>}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };