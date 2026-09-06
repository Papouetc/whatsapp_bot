import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const applicationFiles = [
    'src/application/use-cases/task-use-cases.js',
    'src/application/use-cases/settings-use-cases.js',
    'src/application/use-cases/draft-use-cases.js',
    'src/application/use-cases/chat-use-case.js',
    'src/application/use-cases/search-use-cases.js',
    'src/application/use-cases/message-processing-use-case.js',
    'src/application/use-cases/command-use-cases.js',
    'src/application/services/ai-provider-service.js',
    'src/application/services/hakili-ai-service.js',
    'src/application/services/urgency-service.js'
];

test('application use cases do not import infrastructure SDKs directly', async () => {
    const contents = await Promise.all(
        applicationFiles.map(file => readFile(file, 'utf8'))
    );
    const source = contents.join('\n');

    assert.doesNotMatch(source, /from ['"](?:.*\/?pg|.*baileys|node-telegram-bot-api)/i);
});
