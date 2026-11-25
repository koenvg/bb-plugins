import ReactMarkdown from "react-markdown";

const FixtureImage = ({ alt }: { alt?: string }) => <span>[Image: {alt ?? ""}]</span>;

/** Fixture substitute only. Live Settings use the public host Markdown component. */
export const FixtureMarkdown = ({ content }: { content: string }) => {
  return (
    <ReactMarkdown skipHtml components={{ img: FixtureImage }}>
      {content}
    </ReactMarkdown>
  );
};
