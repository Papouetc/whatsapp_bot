import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const applicationFiles = [
    'application/use-cases/task-use-cases.js',
    'application/use-cases/settings-use-cases.js'
];

test('application use cases do not import infrastructure SDKs directly', async () => {
    const contents = await Promise.all(
        applicationFiles.map(file => readFile(file, 'utf8'))
    );
    const source = contents.join('\n');

    assert.doesNotMatch(source, /from ['"](?:.*\/?pg|.*baileys|node-telegram-bot-api)/i);
});
