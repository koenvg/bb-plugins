import { FILE_ICON_SVGS } from "./svgs";
import type { FileIconName } from "./svgs";

export const FileTypeIcon = ({ name }: { name: FileIconName }) => {
  return (
    <span
      aria-hidden
      data-icon={name}
      className="inline-flex size-4 shrink-0 [&>svg]:size-full"
      dangerouslySetInnerHTML={{ __html: FILE_ICON_SVGS[name] }}
    />
  );
};
