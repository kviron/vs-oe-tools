import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = path.join(repositoryRoot, 'docs', 'knowledge', 'schema', 'knowledge-record.schema.json');
const examplesDirectory = path.join(repositoryRoot, 'docs', 'knowledge', 'examples');

const schema = JSON.parse(await readFile(schemaPath, 'utf8'));
const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(schema);

const exampleFiles = (await readdir(examplesDirectory))
  .filter((fileName) => fileName.endsWith('.json'))
  .sort();

if (exampleFiles.length === 0) {
  throw new Error(`No knowledge examples found in ${examplesDirectory}`);
}

let failed = false;
for (const fileName of exampleFiles) {
  const examplePath = path.join(examplesDirectory, fileName);
  const example = JSON.parse(await readFile(examplePath, 'utf8'));
  const schemaIsValid = validate(example);
  const semanticErrors = [];

  if (schemaIsValid) {
    const entityIds = new Set(example.entities.map((entity) => `${entity.type}:${entity.externalId}`));
    for (const [index, relation] of example.relations.entries()) {
      if (!entityIds.has(relation.from)) {
        semanticErrors.push(`/relations/${index}/from references an entity missing from entities`);
      }
      if (!entityIds.has(relation.to)) {
        semanticErrors.push(`/relations/${index}/to references an entity missing from entities`);
      }
    }
  }

  if (schemaIsValid && semanticErrors.length === 0) {
    console.log(`Knowledge example is valid: ${fileName}`);
    continue;
  }

  failed = true;
  console.error(`Knowledge example is invalid: ${fileName}`);
  for (const error of validate.errors ?? []) {
    console.error(`  ${error.instancePath || '/'} ${error.message ?? 'is invalid'}`);
  }
  for (const error of semanticErrors) {
    console.error(`  ${error}`);
  }
}

if (failed) {
  process.exitCode = 1;
}
