import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';

const projectRoot = new URL('../../', import.meta.url);

async function readProjectFile(name) {
    return fs.readFile(new URL(name, projectRoot), 'utf8');
}

test('the active command dispatcher lives in the command router interface', async () => {
    const routerSource = await readProjectFile('src/interfaces/whatsapp/command-router.js');
    const commandsSource = await readProjectFile('commands.js');
    const indexSource = await readProjectFile('index.js');

    assert.match(routerSource, /async function handleCommand\(/);
    assert.doesNotMatch(indexSource, /async function handleCommand\(/);
    assert.doesNotMatch(routerSource, /from ['"].*\/commands\.js['"]/);
    assert.match(commandsSource, /export async function handleCommand\(/);
});

test('legacy scripts are outside the automated test directory', async () => {
    const packageJson = JSON.parse(await readProjectFile('package.json'));

    assert.equal(packageJson.scripts.test, 'node --test test/unit/*.test.js');
});
