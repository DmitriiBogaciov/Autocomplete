

type Container = {
    opener: "{" | "[";
    indent: string;
    lineStart: number;
};

export type JsonIndentation = {
    indent: string;
    closingIndent: string;
    closingCharacter: "}" | "]" | null;
};

export function getIndentUnit(text: string): string {
    for (const line of text.split("\n")) {
        const prefix = line.match(/^[ \t]+/)?.[0];

        if (prefix && line.trim() !== "") {
            return prefix.includes("\t") ? "\t" : prefix;
        }
    }

    return "\t";
};

function getLineIndent(text: string, lineStart: number): string {
    const lineText = text.slice(lineStart);
    const match = lineText.match(/^[ \t]*/);

    return match?.[0] ?? "";
};

function createContainer(
    text: string,
    position: number,
    opener: Container["opener"],
    parent: Container | undefined,
    indentUnit: string,
): Container {
    const lineStart = text.lastIndexOf("\n", position - 1) + 1;

    const indent =
        parent && parent.lineStart === lineStart
            ? parent.indent + indentUnit
            : getLineIndent(text, lineStart);

    return {
        opener,
        indent,
        lineStart,
    }
}

function findOpenContainers(
    text: string,
    cursor: number,
    indentUnit: string,
): Container[] | null {
    const stack: Container[] = [];
    let insideString = false;
    let escaped = false;

    for (let position = 0; position < cursor; position++) {
        const character = text[position];

        if (insideString) {
            if (character === "\n" || character === "\r") {
                return null;
            }

            if (escaped) {
                escaped = false;
            } else if (character === "\\") {
                escaped = true;
            } else if (character === '"') {
                insideString = false;
            }

            continue;
        }

        if (character === '"') {
            insideString = true;
            continue;
        }

        if (character === "{" || character === "[") {
            const parent = stack[stack.length - 1];

            stack.push(createContainer(text, position, character, parent, indentUnit),
            );
        } else if (character === "}" || character === "]") {
            const container = stack[stack.length - 1];
            const expectedOpener = character === "}" ? "{" : "[";

            if (!container || container.opener !== expectedOpener) {
                return null;
            }

            stack.pop();
        }
    }

    return insideString ? null : stack;
}

export function getJsonIndentation(
    text: string,
    cursor: number,
): JsonIndentation | null {
    
    if (!Number.isInteger(cursor) || cursor < 0 || cursor > text.length) {
        return null;
    }

    const indentUnit = getIndentUnit(text);

    const containers = findOpenContainers(
        text,
        cursor,
        indentUnit,
    )

    if (!containers) { return null }

    const lastContainer = containers[containers.length -1];

    if (!lastContainer) {
        return {
            indent: "",
            closingIndent: "",
            closingCharacter: null,
        }
    }

    return {
        indent: lastContainer.indent + indentUnit,
        closingIndent: lastContainer.indent,
        closingCharacter: lastContainer.opener === "{" ? "}" : "]",
    }
}