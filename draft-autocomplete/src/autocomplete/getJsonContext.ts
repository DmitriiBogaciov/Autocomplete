export type JsonPath = Array<string | number>;

export type JsonContext =
    | {
        kind: "property";
        path: JsonPath;
        query: string;
        insideString: boolean;
    }
    | {
        kind: "value";
        path: JsonPath;
        query: string;
        insideString: boolean;
    }
    | {
        kind: "none";
    };

type ObjectFrame = {
    kind: "object";
    path: JsonPath;
    stage: "key-or-end" | "key" | "colon" | "value" | "comma-or-end";
    key: string | null;
};

type ArrayFrame = {
    kind: "array";
    path: JsonPath;
    stage: "value-or-end" | "value" | "comma-or-end";
    index: number;
};

type Frame = ObjectFrame | ArrayFrame;

export function getJsonContext(
    text: string,
    cursor: number,
): JsonContext {
    if (
        !Number.isInteger(cursor) ||
        cursor < 0 ||
        cursor > text.length
    ) {
        return { kind: "none" };
    }

    const source = text.slice(0, cursor);
    const stack: Frame[] = [];

    let rootComplete = false;
    let i = 0;

    function top(): Frame | undefined {
        return stack[stack.length - 1];
    }

    function expectsValue(): boolean {
        const frame = top();

        if (!frame) {
            return !rootComplete;
        }

        if (frame.kind === "object") {
            return frame.stage === "value";
        }

        return (
            frame.stage === "value" ||
            frame.stage === "value-or-end"
        );
    }

    function valuePath(): JsonPath {
        const frame = top();

        if (!frame) {
            return [];
        }

        if (frame.kind === "array") {
            return [...frame.path, frame.index];
        }

        return frame.key === null
            ? frame.path
            : [...frame.path, frame.key];
    }

    function finishValue() {
        const frame = top();

        if (!frame) {
            rootComplete = true;
        } else {
            frame.stage = "comma-or-end";
        }
    }

    while (i < source.length) {
        const char = source[i];

        // Только пробельные символы, разрешённые JSON.
        if (
            char === " " ||
            char === "\t" ||
            char === "\r" ||
            char === "\n"
        ) {
            i++;
            continue;
        }

        const frame = top();

        // Строка: имя свойства или строковое значение.
        if (char === '"') {
            const isProperty =
                frame?.kind === "object" &&
                (frame.stage === "key" || frame.stage === "key-or-end");

            if (!isProperty && !expectsValue()) {
                return { kind: "none" };
            }

            const start = i;
            i++;

            let closed = false;

            while (i < source.length) {
                if (source[i] === "\\") {
                    // Экранированный символ не закрывает строку.
                    i += 2;
                    continue;
                }

                if (source[i] === '"') {
                    i++;
                    closed = true;
                    break;
                }

                i++;
            }

            if (!closed) {
                const rawPrefix = source.slice(start + 1);

                let query: string;

                try {
                    // Декодируем завершённые escape-последовательности.
                    query = JSON.parse('"' + rawPrefix + '"');
                } catch {
                    // Например, курсор сразу после "\" или внутри "\u00".
                    return { kind: "none" };
                }

                if (isProperty && frame?.kind === "object") {
                    return {
                        kind: "property",
                        path: frame.path,
                        query,
                        insideString: true,
                    };
                }

                return {
                    kind: "value",
                    path: valuePath(),
                    query,
                    insideString: true,
                };
            }

            let decoded: string;

            try {
                decoded = JSON.parse(source.slice(start, i));
            } catch {
                return { kind: "none" };
            }

            if (isProperty && frame?.kind === "object") {
                frame.key = decoded;
                frame.stage = "colon";
            } else {
                finishValue();
            }

            continue;
        }

        // Начало объекта или массива.
        if (char === "{" || char === "[") {
            if (!expectsValue()) {
                return { kind: "none" };
            }

            const path = valuePath();

            if (char === "{") {
                stack.push({
                    kind: "object",
                    path,
                    stage: "key-or-end",
                    key: null,
                });
            } else {
                stack.push({
                    kind: "array",
                    path,
                    stage: "value-or-end",
                    index: 0,
                });
            }

            i++;
            continue;
        }

        // Конец объекта.
        if (char === "}") {
            if (
                !frame ||
                frame.kind !== "object" ||
                (
                    frame.stage !== "key-or-end" &&
                    frame.stage !== "comma-or-end" &&
                    frame.stage !== "key"
                )
            ) {
                return { kind: "none" };
            }

            // "key" — ожидание следующего свойства после запятой.
            // Разрешаем восстановиться после завершающей запятой.
            stack.pop();
            finishValue();
            i++;
            continue;
        }

        if (char === "]") {
            if (!frame || frame.kind !== "array") {
                return { kind: "none" };
            }

            const canClose =
                frame.stage === "value-or-end" ||
                frame.stage === "comma-or-end";

            const hasTrailingComma =
                frame.stage === "value" &&
                frame.index > 0;

            if (!canClose && !hasTrailingComma) {
                return { kind: "none" };
            }

            stack.pop();
            finishValue();
            i++;
            continue;
        }

        if (char === "]") {
            if (
                !frame ||
                frame.kind !== "array" ||
                (
                    frame.stage !== "value-or-end" &&
                    frame.stage !== "comma-or-end"
                )
            ) {
                return { kind: "none" };
            }

            stack.pop();
            finishValue();
            i++;
            continue;
        }

        if (char === ":") {
            if (
                !frame ||
                frame.kind !== "object" ||
                frame.stage !== "colon"
            ) {
                return { kind: "none" };
            }

            frame.stage = "value";
            i++;
            continue;
        }

        if (char === ",") {
            if (!frame || frame.stage !== "comma-or-end") {
                return { kind: "none" };
            }

            if (frame.kind === "object") {
                frame.stage = "key";
                frame.key = null;
            } else {
                frame.stage = "value";
                frame.index++;
            }

            i++;
            continue;
        }

        // Числа, true, false и null.
        if (!expectsValue()) {
            return { kind: "none" };
        }

        const start = i;

        while (
            i < source.length &&
            !/[\x20\t\r\n,}\]]/.test(source[i])
        ) {
            i++;
        }

        const token = source.slice(start, i);

        if (i === source.length) {
            const isLiteralPrefix = ["true", "false", "null"].some(
                (literal) => literal.startsWith(token),
            );

            const isNumberPrefix =
                /^-?(?:0|[1-9]\d*)?(?:\.\d*)?(?:[eE][+-]?\d*)?$/.test(token) &&
                /^[-0-9]/.test(token) &&
                !token.startsWith("-.");

            if (!isLiteralPrefix && !isNumberPrefix) {
                return { kind: "none" };
            }

            return {
                kind: "value",
                path: valuePath(),
                query: token,
                insideString: false,
            };
        }

        const isCompleteLiteral =
            /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)$/.test(
                token,
            );

        if (!isCompleteLiteral) {
            return { kind: "none" };
        }

        finishValue();
    }

    const frame = top();

    if (
        frame?.kind === "object" &&
        (frame.stage === "key" || frame.stage === "key-or-end")
    ) {
        return {
            kind: "property",
            path: frame.path,
            query: "",
            insideString: false,
        };
    }

    if (expectsValue()) {
        return {
            kind: "value",
            path: valuePath(),
            query: "",
            insideString: false,
        };
    }

    return { kind: "none" };
}