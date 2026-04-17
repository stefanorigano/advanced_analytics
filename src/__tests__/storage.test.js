import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Storage } from '../core/storage.js';

let saveName;

function uniqueSave(suffix = '') {
    return `test-${Date.now()}-${Math.random().toString(36).slice(2)}${suffix}`;
}

const MOCK_API = {
    utils:     { getCityCode: () => 'NYC' },
    gameState: { getRoutes: () => [], getStations: () => [], getCurrentDay: () => 1 },
};

beforeEach(() => { saveName = uniqueSave(); });
afterEach(async () => { await Storage.deleteSave(saveName); });

// ── Basic get / set ────────────────────────────────────────────────────────

describe('Storage.get / set', () => {
    it('returns defaultValue when key is absent', async () => {
        const s = new Storage(saveName);
        expect(await s.get('routeStatuses', {})).toEqual({});
    });

    it('stores and retrieves a transactional value', async () => {
        const s = new Storage(saveName);
        await s.set('routeStatuses', { r1: { status: 'new' } });
        expect(await s.get('routeStatuses', {})).toEqual({ r1: { status: 'new' } });
    });

    it('shared key (historicalData) is stored in the shared slot', async () => {
        const s = new Storage(saveName);
        await s.set('historicalData', { days: { 1: 'snap' } });
        expect(await s.get('historicalData', {})).toEqual({ days: { 1: 'snap' } });
    });

    it('delete() removes a key', async () => {
        const s = new Storage(saveName);
        await s.set('routeStatuses', { r1: {} });
        await s.delete('routeStatuses');
        expect(await s.get('routeStatuses', null)).toBeNull();
    });
});

// ── Transactional model ────────────────────────────────────────────────────

describe('Storage backup / restore (transactional model)', () => {
    it('restore() rolls back working state to last saved state', async () => {
        const s = new Storage(saveName);

        // Commit initial state
        await s.set('routeStatuses', { r1: { status: 'new' } });
        await s.backup(MOCK_API);

        // Make unsaved changes
        await s.set('routeStatuses', { r1: { status: 'deleted' }, r2: { status: 'new' } });
        expect((await s.get('routeStatuses', {})).r2).toBeDefined();

        // Rollback
        await s.restore();

        const after = await s.get('routeStatuses', {});
        expect(after).toEqual({ r1: { status: 'new' } });
        expect(after.r2).toBeUndefined();
    });

    it('backup() updates save metadata via the API', async () => {
        const api = {
            utils:     { getCityCode: () => 'LON' },
            gameState: { getRoutes: () => [1, 2], getStations: () => [1, 2, 3], getCurrentDay: () => 5 },
        };
        const s = new Storage(saveName);
        await s.backup(api);

        const meta = await Storage.getAllSaves();
        expect(meta[saveName]).toMatchObject({
            cityCode:     'LON',
            routeCount:   2,
            stationCount: 3,
            day:          5,
            modVersion:   'test',
        });
    });

    it('multiple backup/restore cycles maintain correct state', async () => {
        const s = new Storage(saveName);

        await s.set('configCache', { 1: 'day1' });
        await s.backup(MOCK_API);

        await s.set('configCache', { 1: 'day1', 2: 'day2' });
        await s.backup(MOCK_API);

        await s.set('configCache', { 1: 'day1', 2: 'day2', 3: 'unsaved' });
        await s.restore();

        expect(await s.get('configCache', {})).toEqual({ 1: 'day1', 2: 'day2' });
    });
});

// ── Unsaved-quit rollback ──────────────────────────────────────────────────

describe('unsaved-quit rollback', () => {
    it('discards working data accumulated after the last save when reloaded', async () => {
        const s = new Storage(saveName);

        // Session 1: play and save
        await s.set('routeStatuses', { r1: { status: 'ongoing', createdDay: 1 } });
        await s.backup(MOCK_API);

        // Session 1 continues: user creates a new route (not saved yet)
        await s.set('routeStatuses', {
            r1: { status: 'ongoing', createdDay: 1 },
            r2: { status: 'new',     createdDay: 3 },
        });

        // User quits without saving (onGameEnd → storage = null)
        // then reloads the same save (onGameLoaded → storage.restore())
        await s.restore();

        const statuses = await s.get('routeStatuses', {});
        expect(statuses.r1).toBeDefined();
        expect(statuses.r2).toBeUndefined();  // unsaved route gone
    });

    it('restore() is safe when no saved state exists (first load ever)', async () => {
        const s = new Storage(saveName);
        // No backup has been called — restore should be a no-op, not throw
        await expect(s.restore()).resolves.not.toThrow();
    });
});

// ── Save management ────────────────────────────────────────────────────────

describe('Storage save management', () => {
    it('deleteSave() removes all keys and metadata for that save', async () => {
        const s = new Storage(saveName);
        await s.set('routeStatuses', { r1: {} });
        await Storage.importSave(saveName, {}, { cityCode: 'NYC', routeCount: 1, day: 1, stationCount: 2 });

        await Storage.deleteSave(saveName);

        const meta = await Storage.getAllSaves();
        expect(meta[saveName]).toBeUndefined();
        expect(await s.get('routeStatuses', null)).toBeNull();
    });

    it('renameSave() moves metadata to the new name', async () => {
        const newName = uniqueSave('-renamed');
        await Storage.importSave(saveName, {}, { cityCode: 'NYC', routeCount: 2, day: 3, stationCount: 4 });

        await Storage.renameSave(saveName, newName);

        const meta = await Storage.getAllSaves();
        expect(meta[saveName]).toBeUndefined();
        expect(meta[newName]).toMatchObject({ cityCode: 'NYC', routeCount: 2 });

        await Storage.deleteSave(newName);
    });

    it('exportSave() / importSave() round-trips data under a new save name', async () => {
        const importName = uniqueSave('-import');
        const s = new Storage(saveName);

        await s.set('routeStatuses', { r1: { status: 'ongoing' } });
        await s.set('configCache',   { 2: [{ high: 3 }] });

        const exported = await Storage.exportSave(saveName);
        await Storage.importSave(importName, exported, { cityCode: 'NYC', routeCount: 1, day: 2, stationCount: 5 });

        const s2 = new Storage(importName);
        expect(await s2.get('routeStatuses', {})).toEqual({ r1: { status: 'ongoing' } });
        expect(await s2.get('configCache',   {})).toEqual({ 2: [{ high: 3 }] });

        await Storage.deleteSave(importName);
    });

    it('migrateKeys() copies all keys to a new prefix', async () => {
        const oldName = uniqueSave('-old');
        const newName = uniqueSave('-new');
        const s = new Storage(oldName);
        await s.set('routeStatuses', { r1: { status: 'ongoing' } });

        await Storage.migrateKeys(oldName, newName, false);

        const s2 = new Storage(newName);
        expect(await s2.get('routeStatuses', {})).toEqual({ r1: { status: 'ongoing' } });

        await Storage.deleteSave(oldName);
        await Storage.deleteSave(newName);
    });
});

// ── patchAllSavesMeta ─────────────────────────────────────────────────────

describe('Storage.patchAllSavesMeta', () => {
    it('applies a transformation function to all save entries', async () => {
        const s1 = uniqueSave('-p1');
        const s2 = uniqueSave('-p2');

        await Storage.importSave(s1, {}, { cityCode: 'NYC', routeCount: 0, day: 3, stationCount: 0 });
        await Storage.importSave(s2, {}, { cityCode: 'LON', routeCount: 0, day: 5, stationCount: 0 });

        await Storage.patchAllSavesMeta(meta => {
            for (const entry of Object.values(meta)) {
                if (entry.day != null) entry.day += 1;
            }
        });

        const meta = await Storage.getAllSaves();
        expect(meta[s1].day).toBe(4);
        expect(meta[s2].day).toBe(6);

        await Storage.deleteSave(s1);
        await Storage.deleteSave(s2);
    });
});
