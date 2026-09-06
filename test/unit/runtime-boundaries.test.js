import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';

const projectRoot = new URL('../../', import.meta.url);

async function readProjectFile(name) {
    return fs.readFile(new URL(name, projectRoot), 'utf8');
}

test('the active command dispatcher is in index.js', async () => {
    const indexSource = await readProjectFile('index.js');
    const commandsSource = await readProjectFile('commands.js');

    assert.match(indexSource, /async function handleCommand\(/);
    assert.doesNotMatch(indexSource, /from ['"]\.\/commands\.js['"]/);
    assert.match(commandsSource, /export async function handleCommand\(/);
});

test('legacy scripts are outside the automated test directory', async () => {
    const packageJson = JSON.parse(await readProjectFile('package.json'));

    assert.equal(packageJson.scripts.test, 'node --test test/unit/*.test.js');
});
