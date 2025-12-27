import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Markdown } from './Markdown';

describe('Markdown', () => {
  describe('Basic Rendering', () => {
    it('renders plain text', () => {
      render(<Markdown>Hello World</Markdown>);

      expect(screen.getByText('Hello World')).toBeInTheDocument();
    });

    it('renders empty string without errors', () => {
      render(<Markdown>{''}</Markdown>);

      // Component should render without throwing
      expect(document.body).toBeInTheDocument();
    });

    it('applies default prose classes', () => {
      const { container } = render(<Markdown>Test</Markdown>);

      expect(container.firstChild).toHaveClass('prose', 'prose-invert', 'prose-sm');
    });

    it('applies custom className', () => {
      const { container } = render(
        <Markdown className="custom-class">Test</Markdown>
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });

    it('combines default and custom classes', () => {
      const { container } = render(
        <Markdown className="my-class">Test</Markdown>
      );

      expect(container.firstChild).toHaveClass('prose', 'prose-invert', 'prose-sm', 'my-class');
    });
  });

  describe('Headings', () => {
    it('renders h1 with correct styling', () => {
      render(<Markdown># Heading 1</Markdown>);

      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toHaveTextContent('Heading 1');
      expect(heading).toHaveClass('text-xl', 'font-bold');
    });

    it('renders h2 with correct styling', () => {
      render(<Markdown>## Heading 2</Markdown>);

      const heading = screen.getByRole('heading', { level: 2 });
      expect(heading).toHaveTextContent('Heading 2');
      expect(heading).toHaveClass('text-lg', 'font-bold');
    });

    it('renders h3 with correct styling', () => {
      render(<Markdown>### Heading 3</Markdown>);

      const heading = screen.getByRole('heading', { level: 3 });
      expect(heading).toHaveTextContent('Heading 3');
      expect(heading).toHaveClass('text-base', 'font-bold');
    });
  });

  describe('Paragraphs', () => {
    it('renders paragraphs with correct styling', () => {
      render(<Markdown>This is a paragraph.</Markdown>);

      const paragraph = screen.getByText('This is a paragraph.');
      expect(paragraph.tagName).toBe('P');
      expect(paragraph).toHaveClass('my-2');
    });

    it('renders multiple paragraphs', () => {
      render(<Markdown>{'First paragraph.\n\nSecond paragraph.'}</Markdown>);

      expect(screen.getByText('First paragraph.')).toBeInTheDocument();
      expect(screen.getByText('Second paragraph.')).toBeInTheDocument();
    });
  });

  describe('Links', () => {
    it('renders links with correct styling', () => {
      render(<Markdown>[Click me](https://example.com)</Markdown>);

      const link = screen.getByRole('link', { name: 'Click me' });
      expect(link).toHaveAttribute('href', 'https://example.com');
      expect(link).toHaveClass('text-blue-400');
    });

    it('opens links in new tab', () => {
      render(<Markdown>[Link](https://example.com)</Markdown>);

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('target', '_blank');
    });

    it('has security attributes on links', () => {
      render(<Markdown>[Link](https://example.com)</Markdown>);

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    });
  });

  describe('Images', () => {
    it('renders images with correct attributes', () => {
      render(<Markdown>![Alt text](https://example.com/image.png)</Markdown>);

      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('src', 'https://example.com/image.png');
      expect(img).toHaveAttribute('alt', 'Alt text');
    });

    it('applies correct styling to images', () => {
      render(<Markdown>![Test](https://example.com/image.png)</Markdown>);

      const img = screen.getByRole('img');
      expect(img).toHaveClass('max-w-full', 'h-auto', 'rounded-lg');
    });

    it('adds lazy loading to images', () => {
      render(<Markdown>![Test](https://example.com/image.png)</Markdown>);

      const img = screen.getByRole('img');
      expect(img).toHaveAttribute('loading', 'lazy');
    });

    it('handles empty alt text', () => {
      render(<Markdown>![](https://example.com/image.png)</Markdown>);

      // Images with empty alt text have role="presentation" for accessibility
      const img = document.querySelector('img');
      expect(img).toBeInTheDocument();
      expect(img).toHaveAttribute('alt', '');
    });
  });

  describe('Code', () => {
    it('renders inline code with correct styling', () => {
      render(<Markdown>Use `code` here</Markdown>);

      const code = screen.getByText('code');
      expect(code.tagName).toBe('CODE');
      expect(code).toHaveClass('bg-gray-700', 'px-1.5', 'py-0.5', 'rounded');
    });

    it('renders code blocks with correct styling', () => {
      render(<Markdown>{'```\nconst x = 1;\n```'}</Markdown>);

      const codeBlock = screen.getByText('const x = 1;');
      expect(codeBlock.tagName).toBe('CODE');
    });

    it('renders code blocks in pre elements', () => {
      render(<Markdown>{'```\ncode block\n```'}</Markdown>);

      const pre = document.querySelector('pre');
      expect(pre).toBeInTheDocument();
      expect(pre).toHaveClass('bg-gray-900', 'rounded-lg');
    });
  });

  describe('Lists', () => {
    it('renders unordered lists with correct styling', () => {
      render(<Markdown>{'- Item 1\n- Item 2\n- Item 3'}</Markdown>);

      const list = screen.getByRole('list');
      expect(list.tagName).toBe('UL');
      expect(list).toHaveClass('list-disc', 'list-inside');
    });

    it('renders ordered lists with correct styling', () => {
      render(<Markdown>{'1. First\n2. Second\n3. Third'}</Markdown>);

      const list = screen.getByRole('list');
      expect(list.tagName).toBe('OL');
      expect(list).toHaveClass('list-decimal', 'list-inside');
    });

    it('renders list items correctly', () => {
      render(<Markdown>{'- Apple\n- Banana'}</Markdown>);

      expect(screen.getByText('Apple')).toBeInTheDocument();
      expect(screen.getByText('Banana')).toBeInTheDocument();
    });
  });

  describe('Blockquotes', () => {
    it('renders blockquotes with correct styling', () => {
      render(<Markdown>{'> This is a quote'}</Markdown>);

      const blockquote = document.querySelector('blockquote');
      expect(blockquote).toBeInTheDocument();
      expect(blockquote).toHaveClass('border-l-4', 'border-gray-600', 'pl-4', 'italic');
    });

    it('renders blockquote content', () => {
      render(<Markdown>{'> Quote content'}</Markdown>);

      expect(screen.getByText('Quote content')).toBeInTheDocument();
    });
  });

  describe('GitHub Flavored Markdown', () => {
    it('renders strikethrough text', () => {
      render(<Markdown>~~strikethrough~~</Markdown>);

      const del = document.querySelector('del');
      expect(del).toBeInTheDocument();
      expect(del).toHaveTextContent('strikethrough');
    });

    it('renders tables', () => {
      const tableMarkdown = `
| Header 1 | Header 2 |
| -------- | -------- |
| Cell 1   | Cell 2   |
`;
      render(<Markdown>{tableMarkdown}</Markdown>);

      const table = document.querySelector('table');
      expect(table).toBeInTheDocument();
      expect(screen.getByText('Header 1')).toBeInTheDocument();
      expect(screen.getByText('Cell 1')).toBeInTheDocument();
    });

    it('renders task lists', () => {
      render(<Markdown>{'- [ ] Unchecked\n- [x] Checked'}</Markdown>);

      const checkboxes = document.querySelectorAll('input[type="checkbox"]');
      expect(checkboxes.length).toBe(2);
    });

    it('renders autolinks', () => {
      render(<Markdown>Visit https://example.com</Markdown>);

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', 'https://example.com');
    });
  });

  describe('Raw HTML Support', () => {
    it('renders inline HTML', () => {
      render(<Markdown>{'<strong>Bold HTML</strong>'}</Markdown>);

      const strong = document.querySelector('strong');
      expect(strong).toBeInTheDocument();
      expect(strong).toHaveTextContent('Bold HTML');
    });

    it('renders HTML div elements', () => {
      render(<Markdown>{'<div>Custom div</div>'}</Markdown>);

      expect(screen.getByText('Custom div')).toBeInTheDocument();
    });
  });

  describe('Complex Content', () => {
    it('renders mixed content correctly', () => {
      const content = `
# Title

This is a paragraph with **bold** and *italic* text.

- List item 1
- List item 2

> A quote

\`inline code\`
`;
      render(<Markdown>{content}</Markdown>);

      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Title');
      expect(screen.getByText(/bold/)).toBeInTheDocument();
      expect(screen.getByRole('list')).toBeInTheDocument();
      expect(document.querySelector('blockquote')).toBeInTheDocument();
      expect(screen.getByText('inline code')).toBeInTheDocument();
    });

    it('handles nested formatting', () => {
      render(<Markdown>**_Bold and italic_**</Markdown>);

      const strong = document.querySelector('strong');
      const em = document.querySelector('em');
      expect(strong).toBeInTheDocument();
      expect(em).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('handles special characters', () => {
      render(<Markdown>{'Special chars: < > & " \''}</Markdown>);

      expect(screen.getByText(/Special chars/)).toBeInTheDocument();
    });

    it('handles unicode characters', () => {
      render(<Markdown>Unicode: emoji test</Markdown>);

      expect(screen.getByText(/Unicode/)).toBeInTheDocument();
    });

    it('handles very long content', () => {
      const longContent = 'A'.repeat(10000);
      render(<Markdown>{longContent}</Markdown>);

      expect(screen.getByText(longContent)).toBeInTheDocument();
    });

    it('handles newlines correctly', () => {
      render(<Markdown>{'Line 1\nLine 2\n\nParagraph 2'}</Markdown>);

      // Markdown treats single newlines differently than double
      expect(screen.getByText(/Line 1/)).toBeInTheDocument();
      expect(screen.getByText('Paragraph 2')).toBeInTheDocument();
    });
  });
});
