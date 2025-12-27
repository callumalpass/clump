import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownProps {
  children: string;
  className?: string;
}

export function Markdown({ children, className = '' }: MarkdownProps) {
  return (
    <ReactMarkdown
      className={`prose prose-invert prose-sm max-w-none ${className}`}
      remarkPlugins={[remarkGfm]}
      components={{
        // Render images with proper styling
        img: ({ src, alt }) => (
          <img
            src={src}
            alt={alt || ''}
            className="max-w-full h-auto rounded-lg border border-gray-700 my-2"
            loading="lazy"
          />
        ),
        // Style links
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-400 hover:text-blue-300 underline"
          >
            {children}
          </a>
        ),
        // Style code blocks
        code: ({ className, children }) => {
          const isInline = !className;
          if (isInline) {
            return (
              <code className="bg-gray-700 px-1.5 py-0.5 rounded text-sm">
                {children}
              </code>
            );
          }
          return (
            <code className={`block bg-gray-900 p-3 rounded-lg overflow-x-auto text-sm ${className}`}>
              {children}
            </code>
          );
        },
        pre: ({ children }) => (
          <pre className="bg-gray-900 rounded-lg overflow-x-auto my-2">
            {children}
          </pre>
        ),
        // Style blockquotes
        blockquote: ({ children }) => (
          <blockquote className="border-l-4 border-gray-600 pl-4 italic text-gray-400">
            {children}
          </blockquote>
        ),
        // Style lists
        ul: ({ children }) => (
          <ul className="list-disc list-inside space-y-1 my-2">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal list-inside space-y-1 my-2">{children}</ol>
        ),
        // Style headings
        h1: ({ children }) => (
          <h1 className="text-xl font-bold mt-4 mb-2">{children}</h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-lg font-bold mt-3 mb-2">{children}</h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-base font-bold mt-2 mb-1">{children}</h3>
        ),
        // Style paragraphs
        p: ({ children }) => <p className="my-2">{children}</p>,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}
