const test = require('node:test');
const assert = require('node:assert/strict');
const { connectDatabase, closeDatabase } = require('../database');

function fakeMongoose() {
    return {
        connection: { readyState: 0 },
        connectedTo: null,
        async connect(uri, options) {
            this.connectedTo = { uri, options };
            this.connection.readyState = 1;
        },
        async disconnect() {
            this.connection.readyState = 0;
        }
    };
}

test('uses MONGO_URI when configured and does not start embedded MongoDB', async () => {
    const mongoose = fakeMongoose();
    let embeddedStarted = false;
    const result = await connectDatabase({
        mongoose,
        mongoUri: 'mongodb://configured-host/jarvis',
        createEmbeddedServer: async () => {
            embeddedStarted = true;
            throw new Error('should not start');
        },
        logger: {}
    });

    assert.equal(result.mode, 'external');
    assert.equal(embeddedStarted, false);
    assert.equal(mongoose.connectedTo.uri, 'mongodb://configured-host/jarvis');
});

test('starts embedded MongoDB when MONGO_URI is absent', async () => {
    const mongoose = fakeMongoose();
    let stopped = false;
    const server = {
        getUri: () => 'mongodb://127.0.0.1:27017/jarvis_ai',
        async stop() { stopped = true; }
    };

    const result = await connectDatabase({
        mongoose,
        mongoUri: '',
        createEmbeddedServer: async () => server,
        logger: {}
    });

    assert.equal(result.mode, 'embedded-ephemeral');
    assert.equal(mongoose.connectedTo.uri, server.getUri());
    await closeDatabase({ mongoose, embeddedServer: result.embeddedServer });
    assert.equal(mongoose.connection.readyState, 0);
    assert.equal(stopped, true);
});

test('stops the embedded server when Mongoose cannot connect', async () => {
    const mongoose = fakeMongoose();
    mongoose.connect = async () => { throw new Error('connection failed'); };
    let stopped = false;

    await assert.rejects(
        connectDatabase({
            mongoose,
            mongoUri: '',
            createEmbeddedServer: async () => ({
                getUri: () => 'mongodb://127.0.0.1:27017/jarvis_ai',
                async stop() { stopped = true; }
            }),
            logger: {}
        }),
        /connection failed/
    );
    assert.equal(stopped, true);
});
