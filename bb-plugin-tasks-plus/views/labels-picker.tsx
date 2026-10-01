import { useState } from "react";
import type { Label, Task } from "../shared/contract.js";
import { useTasksRpc } from "../shell/data.js";
import { DEFAULT_COLOR } from "./manage/shared.js";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Icon } from "@/components/ui/icon";

export function LabelsPicker({
  task,
  labels,
  onChange,
}: {
  task: Task;
  labels: readonly Label[] | undefined;
  onChange: (labelIds: string[]) => void;
}) {
  const rpc = useTasksRpc();
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  const toggle = (labelId: string) => {
    onChange(
      task.labelIds.includes(labelId)
        ? task.labelIds.filter((id) => id !== labelId)
        : [...task.labelIds, labelId],
    );
  };

  const createLabel = async (name: string) => {
    if (!name || creating) return;
    setCreating(true);
    try {
      const { label } = await rpc.call("createLabel", {
        projectId: task.projectId,
        name,
        color: DEFAULT_COLOR,
      });
      onChange([...task.labelIds, label.id]);
      setQuery("");
    } finally {
      setCreating(false);
    }
  };

  const labelList = labels ?? [];
  return (
    <Command>
      <CommandInput
        placeholder="Add labels…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty
          className={query.trim() !== "" ? "p-1 text-left" : undefined}
        >
          {query.trim() !== "" ? (
            <button
              type="button"
              disabled={creating}
              className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              onClick={() => void createLabel(query.trim())}
            >
              <Icon name="Plus" className="size-3.5" />
              Create “{query.trim()}”
            </button>
          ) : (
            "No labels in this project."
          )}
        </CommandEmpty>
        {labels !== undefined && labelList.length === 0 ? (
          <CommandGroup>
            <CommandItem
              disabled={creating}
              onSelect={() => {
                const name = query.trim();
                if (name) void createLabel(name);
              }}
            >
              <Icon name="Plus" className="size-3.5" />
              New label{query.trim() ? ` “${query.trim()}”` : "…"}
            </CommandItem>
          </CommandGroup>
        ) : null}
        {labelList.length > 0 ? (
          <CommandGroup>
            {labelList.map((label) => (
              <CommandItem
                key={label.id}
                value={label.name}
                onSelect={() => toggle(label.id)}
              >
                <span
                  aria-hidden
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: label.color }}
                />
                <span className="flex-1">{label.name}</span>
                {task.labelIds.includes(label.id) ? (
                  <Icon name="Check" className="size-3.5" />
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
      </CommandList>
    </Command>
  );
}
