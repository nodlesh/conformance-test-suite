import fs from "fs";
import path from "path";
import Ajv from "ajv";

type Options = {
  schemaPath: string;
  contextPath?: string;
  samplePath?: string;
  expectedContextUrl?: string;
};

type NormalizedContext = Record<string, unknown>;

const args: string[] = process.argv.slice(2);

const getArgValue = (flag: string, defaultValue?: string): string | undefined => {
  const withEquals = args.find((arg) => arg.startsWith(`${flag}=`));
  if (withEquals) {
    const [, value] = withEquals.split("=");
    return value || defaultValue;
  }

  const index = args.findIndex((arg) => arg === flag);
  if (index !== -1) {
    const next = args[index + 1];
    if (next && !next.startsWith("--")) {
      return next;
    }
  }

  return defaultValue;
};

const options: Options = {
  schemaPath: getArgValue("--schema", "schema/ayra-card-business-card-schema.json")!,
  contextPath: getArgValue("--context"),
  samplePath: getArgValue("--sample", "schema/example-ayra-card.json"),
  expectedContextUrl: getArgValue("--context-url")
};

const toAbsolute = (relativePath: string) =>
  path.resolve(process.cwd(), relativePath);

const readJson = (filePath: string, label: string) => {
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`Failed to read ${label} from ${filePath}: ${String(error)}`);
  }
};

const flattenContext = (contextValue: unknown): NormalizedContext => {
  const map: NormalizedContext = {};
  const entries = Array.isArray(contextValue)
    ? contextValue
    : [contextValue];

  entries.forEach((entry) => {
    if (entry && typeof entry === "object") {
      Object.assign(map, entry as Record<string, unknown>);
    }
  });

  return map;
};

const extractSubjectProperties = (schema: any): string[] => {
  if (!schema || typeof schema !== "object") {
    return [];
  }

  const subjectProps = schema?.properties?.credentialSubject?.properties;
  if (subjectProps && typeof subjectProps === "object") {
    return Object.keys(subjectProps);
  }

  return [];
};

const logDivider = () => console.log("=".repeat(60));

const schemaPath = toAbsolute(options.schemaPath);
const errors: string[] = [];
const warnings: string[] = [];

if (!fs.existsSync(schemaPath)) {
  errors.push(
    `Schema file not found at ${schemaPath}. Drop the Ayra Card JSON Schema here before running.`,
  );
}

if (errors.length) {
  logDivider();
  console.error("Context/Schema validation failed:");
  errors.forEach((err) => console.error(`- ${err}`));
  process.exit(1);
}

const schema = readJson(schemaPath, "schema");
const schemaMetadataContext: string | undefined =
  schema?.$metadata?.uris?.jsonLdContext ||
  schema?.$metadata?.jsonLdContext;

const subjectProperties = extractSubjectProperties(schema);
const schemaProperties =
  schema && typeof schema === "object" && schema.properties && typeof schema.properties === "object"
    ? Object.keys(schema.properties)
    : [];

let resolvedContextPath: string | undefined = options.contextPath
  ? toAbsolute(options.contextPath)
  : undefined;

let contextDocument: any | undefined;
let contextMap: NormalizedContext | undefined;

if (!resolvedContextPath && options.expectedContextUrl) {
  const candidate = path.basename(options.expectedContextUrl);
  const schemaDirCandidate = path.resolve(
    process.cwd(),
    "schema",
    candidate,
  );
  const contextsDirCandidate = path.resolve(
    process.cwd(),
    "public",
    "contexts",
    candidate,
  );

  if (fs.existsSync(schemaDirCandidate)) {
    resolvedContextPath = schemaDirCandidate;
  } else if (fs.existsSync(contextsDirCandidate)) {
    resolvedContextPath = contextsDirCandidate;
  }
}

if (!resolvedContextPath && schemaMetadataContext) {
  const candidate = path.basename(schemaMetadataContext);
  const schemaDirCandidate = path.resolve(
    process.cwd(),
    "schema",
    candidate,
  );
  const contextsDirCandidate = path.resolve(
    process.cwd(),
    "public",
    "contexts",
    candidate,
  );

  if (fs.existsSync(schemaDirCandidate)) {
    resolvedContextPath = schemaDirCandidate;
  } else if (fs.existsSync(contextsDirCandidate)) {
    resolvedContextPath = contextsDirCandidate;
  }
}

if (resolvedContextPath && fs.existsSync(resolvedContextPath)) {
  contextDocument = readJson(resolvedContextPath, "context");
  const contextValue = (contextDocument as any)["@context"];

  if (!contextValue) {
    errors.push(
      `Missing @context key in the context document at ${resolvedContextPath}.`,
    );
  } else {
    contextMap = flattenContext(contextValue);
  }
} else {
  warnings.push(
    "Context file not found locally. Place the JSON-LD context in schema/ or public/contexts, or pass --context to check mappings.",
  );
}

if (schemaProperties.length === 0) {
  warnings.push(
    "Schema has no top-level properties. Ensure the provided Ayra Card schema exposes a properties object.",
  );
}

const missingMappings =
  contextMap && subjectProperties.length
    ? subjectProperties.filter((prop) => !(prop in contextMap!))
    : [];

logDivider();
console.log("Ayra Card context & schema checks");
console.log(`Schema:  ${schemaPath}`);
if (resolvedContextPath) {
  console.log(`Context: ${resolvedContextPath}`);
}

if (contextMap && subjectProperties.length) {
  if (missingMappings.length) {
    errors.push(
      `Context is missing mappings for credentialSubject properties: ${missingMappings.join(", ")}`,
    );
  } else {
    console.log("✔ Context covers all credentialSubject properties");
  }
}

const samplePath = options.samplePath
  ? toAbsolute(options.samplePath)
  : undefined;

if (samplePath) {
  if (!fs.existsSync(samplePath)) {
    errors.push(`Sample credential not found at ${samplePath}.`);
  } else {
    const sample = readJson(samplePath, "sample credential");
    const subject = (sample as any).credentialSubject ?? sample;

    const subjectSchema = schema?.properties?.credentialSubject;
    const ajv = new Ajv({ allErrors: true, strict: false });
    const validate = subjectSchema
      ? ajv.compile(subjectSchema)
      : ajv.compile(schema);
    const valid = validate(subject);

    if (!valid) {
      const detail = (validate.errors || [])
        .map((err) => `${err.instancePath || "/"} ${err.message}`)
        .join("; ");
      errors.push(`Sample credentialSubject does not satisfy the schema: ${detail}`);
    } else {
      console.log("✔ Sample credential satisfies the schema");
    }

    const expectedContextUrl =
      options.expectedContextUrl ||
      schemaMetadataContext ||
      undefined;

    if (expectedContextUrl) {
      const sampleContexts = Array.isArray((sample as any)["@context"])
        ? (sample as any)["@context"]
        : [(sample as any)["@context"]];

      if (!sampleContexts.includes(expectedContextUrl)) {
        errors.push(
          `Sample credential @context is missing expected URL ${expectedContextUrl}`,
        );
      } else {
        console.log("✔ Sample credential references the expected context URL");
      }
    } else {
      warnings.push(
        "No --context-url provided, skipped checking the @context array in the sample credential.",
      );
    }
  }
} else {
  warnings.push(
    "No sample credential provided. Pass --sample schema/ayra-card.sample.json to validate an instance.",
  );
}

if (warnings.length) {
  warnings.forEach((warning) => console.warn(`WARN: ${warning}`));
}

if (errors.length) {
  logDivider();
  console.error("Context/Schema validation failed:");
  errors.forEach((err) => console.error(`- ${err}`));
  process.exit(1);
}

logDivider();
console.log("Context/Schema validation passed.");
