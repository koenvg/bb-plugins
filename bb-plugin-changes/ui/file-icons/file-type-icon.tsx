import { FILE_ICON_SVGS } from "./svgs";
import type { FileIconName } from "./svgs";

export const FileTypeIcon = ({ name }: { name: FileIconName }) => {
  return (
    <img
      alt=""
      data-icon={name}
      className="size-4 shrink-0"
      src={`data:image/svg+xml,${encodeURIComponent(FILE_ICON_SVGS[name])}`}
    />
  );
};
