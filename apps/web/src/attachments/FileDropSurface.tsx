import { useState, type ReactNode } from 'react';

/** A local overlay; the editor underneath owns insertion and the actual drop event. */
export function FileDropSurface({ children }: { children: ReactNode }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div
      className="file-drop-surface"
      onDragEnterCapture={(event) => {
        if (Array.from(event.dataTransfer.types).includes('Files')) setDragging(true);
      }}
      onDragOver={(event) => {
        if (Array.from(event.dataTransfer.types).includes('Files')) event.preventDefault();
      }}
      onDragLeave={(event) => {
        if (
          !(event.relatedTarget instanceof Node) ||
          !event.currentTarget.contains(event.relatedTarget)
        )
          setDragging(false);
      }}
      onDropCapture={() => setDragging(false)}
    >
      {children}
      {dragging && (
        <div className="file-drop-overlay" role="status">
          Drop file to attach
        </div>
      )}
    </div>
  );
}
