"use client";

interface GlossaryHighlightProps {
  text: string;
  glossaryTerms: string[];
  className?: string;
}

export default function GlossaryHighlight({ text, glossaryTerms, className }: GlossaryHighlightProps) {
  if (!text) return null;
  if (!glossaryTerms || glossaryTerms.length === 0) {
    return <span className={className}>{text}</span>;
  }

  // Build a regex that matches any of the glossary terms (case-insensitive)
  const escapedTerms = glossaryTerms.map((term) =>
    term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  );
  const pattern = new RegExp(`(${escapedTerms.join("|")})`, "gi");

  const parts = text.split(pattern);

  return (
    <span className={className}>
      {parts.map((part, index) => {
        const isGlossaryTerm = glossaryTerms.some(
          (term) => term.toLowerCase() === part.toLowerCase()
        );
        if (isGlossaryTerm) {
          return (
            <span key={index} className="text-amber-500 font-bold">
              {part}
            </span>
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </span>
  );
}
