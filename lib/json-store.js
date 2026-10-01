const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

function createJsonStore(directory) {
    let pending = Promise.resolve();

    // One queue includes reads and writes across all data files. This prevents
    // lost updates and reads halfway through a checkout within this process.
    function enqueue(operation) {
        const result = pending.then(operation);
        pending = result.catch(() => {});
        return result;
    }

    async function replaceFile(name, contents) {
        const destination = path.join(directory, name);
        const temporary = `${destination}.${randomUUID()}.tmp`;
        try {
            await fs.writeFile(temporary, contents, { flag: "wx" });
            await fs.rename(temporary, destination);
        } finally {
            await fs.rm(temporary, { force: true });
        }
    }

    return {
        read(name) {
            return enqueue(async () => JSON.parse(
                await fs.readFile(path.join(directory, name), "utf8")
            ));
        },

        update(names, change) {
            return enqueue(async () => {
                const originals = await Promise.all(names.map(name =>
                    fs.readFile(path.join(directory, name), "utf8")
                ));
                const values = originals.map(contents => JSON.parse(contents));
                const result = change(...values);
                // Validate and serialize the entire change before touching disk.
                const updated = values.map(value => JSON.stringify(value, null, 2));
                let written = 0;
                try {
                    for (let index = 0; index < names.length; index += 1) {
                        await replaceFile(names[index], updated[index]);
                        written += 1;
                    }
                } catch (error) {
                    // Restore earlier files if a later replacement fails. This
                    // cannot recover from a process/power failure between writes.
                    const failures = [error];
                    for (let index = written - 1; index >= 0; index -= 1) {
                        try {
                            await replaceFile(names[index], originals[index]);
                        } catch (restoreError) {
                            failures.push(restoreError);
                        }
                    }
                    if (failures.length > 1) throw new AggregateError(failures, "Unable to restore data files");
                    throw error;
                }
                return result;
            });
        }
    };
}

module.exports = { createJsonStore };
