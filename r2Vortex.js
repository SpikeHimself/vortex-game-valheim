"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrateR2ToVortex = exports.userHasR2Installed = void 0;
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const turbowalk_1 = __importDefault(require("turbowalk"));
const vortex_api_1 = require("vortex-api");
const common_1 = require("./common");
const invalidModFolders = ['denikson-bepinexpack_valheim', '1f31a-bepinex_valheim_full'];
const appUni = electron_1.remote !== undefined ? electron_1.remote.app : electron_1.app;
function getR2CacheLocation() {
    return path_1.default.join(appUni.getPath('appData'), 'r2modmanPlus-local', 'Valheim', 'cache');
}
function userHasR2Installed() {
    try {
        vortex_api_1.fs.statSync(getR2CacheLocation());
        return true;
    }
    catch (err) {
        return false;
    }
}
exports.userHasR2Installed = userHasR2Installed;
function migrateR2ToVortex(api) {
    return __awaiter(this, void 0, void 0, function* () {
        const start = () => __awaiter(this, void 0, void 0, function* () {
            const activityId = 'r2migrationactivity';
            api.sendNotification({
                id: activityId,
                type: 'activity',
                message: 'Migrating Mods',
                allowSuppress: false,
                noDismiss: true,
            });
            try {
                yield startMigration(api);
                api.sendNotification({
                    type: 'success',
                    message: 'Mods migrated successfully',
                    displayMS: 3000,
                });
            }
            catch (err) {
                api.showErrorNotification('Failed to migrate mods from R2 Mod Manager', err);
            }
            api.dismissNotification(activityId);
        });
        api.showDialog('info', 'r2modman Mods Migration', {
            bbcode: 'Vortex can import your mods installed with r2modman and allow you to manage them '
                + 'from inside Vortex. Please be aware that the mods will be imported in an '
                + 'uninstalled state and will have to be installed, enabled and deployed through '
                + 'Vortex before the mods are re-instated into the game.[br][/br][br][/br]'
                + 'Please note: [br][/br][br][/br][list]'
                + '[*]Mod configuration changes will not be imported - these need to be '
                + 're-added or imported manually from your preferred r2modman profile.'
                + '[*]Vortex will import ALL versions of the mods you have in your r2modman cache, even '
                + 'the outdated ones - it\'s up to you to look through the imported mods and install '
                + 'the ones you want active in-game.'
                + '[*]r2modman stores recently uninstalled mods in its cache meaning that Vortex might '
                + 'import mods you recently uninstalled in r2modman. You can simply choose to not '
                + 'install or remove them entirely after importing. '
                + '[/list][br][/br]It is still highly recommended to use a fresh vanilla copy of the game when '
                + 'starting to mod with Vortex.',
        }, [
            { label: 'Cancel', action: () => Promise.resolve() },
            { label: 'Start Migration', action: () => start() },
        ]);
    });
}
exports.migrateR2ToVortex = migrateR2ToVortex;
function startMigration(api) {
    return __awaiter(this, void 0, void 0, function* () {
        const hasInvalidSeg = (segment) => [common_1.DOORSTOPPER_HOOK].concat(invalidModFolders, common_1.IGNORABLE_FILES).includes(segment.toLowerCase());
        const state = api.getState();
        const discovery = vortex_api_1.selectors.discoveryByGame(state, common_1.GAME_ID);
        if ((discovery === null || discovery === void 0 ? void 0 : discovery.path) === undefined) {
            return;
        }
        const r2Path = getR2CacheLocation();
        let fileEntries = [];
        yield turbowalk_1.default(r2Path, entries => {
            const filtered = entries.filter(entry => {
                if (entry.isDirectory) {
                    return false;
                }
                const segments = entry.filePath.split(path_1.default.sep);
                const isInvalid = segments.find(hasInvalidSeg) !== undefined;
                if (isInvalid) {
                    return false;
                }
                return true;
            });
            fileEntries = fileEntries.concat(filtered);
        })
            .catch(err => ['ENOENT', 'ENOTFOUND'].includes(err.code)
            ? Promise.resolve() : Promise.reject(err));
        const verRgx = new RegExp(/^\d\.\d\.\d{1,4}$/);
        const arcMap = fileEntries.reduce((accum, iter) => {
            const segments = iter.filePath.split(path_1.default.sep);
            const idx = segments.findIndex(seg => verRgx.test(seg));
            if (idx === -1) {
                return accum;
            }
            const modKey = segments.slice(idx - 1, idx + 1).join('_');
            if (accum[modKey] === undefined) {
                accum[modKey] = [];
            }
            const basePath = segments.slice(0, idx + 1).join(path_1.default.sep);
            const relPath = path_1.default.relative(basePath, iter.filePath);
            const pathExists = (accum[modKey].find(r2file => r2file.relPath.split(path_1.default.sep)[0] === relPath.split(path_1.default.sep)[0]) !== undefined);
            if (!pathExists) {
                accum[modKey].push({ relPath, basePath });
            }
            return accum;
        }, {});
        const downloadsPath = vortex_api_1.selectors.downloadPathForGame(state, common_1.GAME_ID);
        const szip = new vortex_api_1.util.SevenZip();
        for (const modKey of Object.keys(arcMap)) {
            const archivePath = path_1.default.join(downloadsPath, modKey + '.zip');
            yield szip.add(archivePath, arcMap[modKey]
                .map(r2ModFile => path_1.default.join(r2ModFile.basePath, r2ModFile.relPath.split(path_1.default.sep)[0])), { raw: ['-r'] });
        }
    });
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoicjJWb3J0ZXguanMiLCJzb3VyY2VSb290IjoiIiwic291cmNlcyI6WyJyMlZvcnRleC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7Ozs7Ozs7QUFBQSx1Q0FBdUM7QUFDdkMsZ0RBQXdCO0FBQ3hCLDBEQUE4QztBQUM5QywyQ0FBd0Q7QUFDeEQscUNBQXNFO0FBRXRFLE1BQU0saUJBQWlCLEdBQUcsQ0FBQyw4QkFBOEIsRUFBRSw0QkFBNEIsQ0FBQyxDQUFDO0FBQ3pGLE1BQU0sTUFBTSxHQUFHLGlCQUFNLEtBQUssU0FBUyxDQUFDLENBQUMsQ0FBQyxpQkFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUMsY0FBRyxDQUFDO0FBU3ZELFNBQVMsa0JBQWtCO0lBQ3pCLE9BQU8sY0FBSSxDQUFDLElBQUksQ0FBQyxNQUFNLENBQUMsT0FBTyxDQUFDLFNBQVMsQ0FBQyxFQUFFLG9CQUFvQixFQUFFLFNBQVMsRUFBRSxPQUFPLENBQUMsQ0FBQztBQUN4RixDQUFDO0FBRUQsU0FBZ0Isa0JBQWtCO0lBQ2hDLElBQUk7UUFDRixlQUFFLENBQUMsUUFBUSxDQUFDLGtCQUFrQixFQUFFLENBQUMsQ0FBQztRQUNsQyxPQUFPLElBQUksQ0FBQztLQUNiO0lBQUMsT0FBTyxHQUFHLEVBQUU7UUFDWixPQUFPLEtBQUssQ0FBQztLQUNkO0FBQ0gsQ0FBQztBQVBELGdEQU9DO0FBRUQsU0FBc0IsaUJBQWlCLENBQUMsR0FBd0I7O1FBQzlELE1BQU0sS0FBSyxHQUFHLEdBQVMsRUFBRTtZQUN2QixNQUFNLFVBQVUsR0FBRyxxQkFBcUIsQ0FBQztZQUN6QyxHQUFHLENBQUMsZ0JBQWdCLENBQUM7Z0JBQ25CLEVBQUUsRUFBRSxVQUFVO2dCQUNkLElBQUksRUFBRSxVQUFVO2dCQUNoQixPQUFPLEVBQUUsZ0JBQWdCO2dCQUN6QixhQUFhLEVBQUUsS0FBSztnQkFDcEIsU0FBUyxFQUFFLElBQUk7YUFDaEIsQ0FBQyxDQUFDO1lBRUgsSUFBSTtnQkFDRixNQUFNLGNB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cnQgcGF0aCBmcm9tICdwYXRoJztcclxuaW1wb3J0IHR1cmJvd2FsaywgeyBJRW50cnkgfSBmcm9tICd0dXJib3dhbGsnO1xyXG5pbXBvcnQgeyBmcywgc2VsZWN0b3JzLCB0eXBlcywgdXRpbCB9IGZyb20gJ3ZvcnRleC1hcGknO1xyXG5pbXBvcnQgeyBET09SU1RPUFBFUl9IT09LLCBHQU1FX0lELCBJR05PUkFCTEVfRklMRVMgfSBmcm9tICcuL2NvbW1vbic7XHJcblxyXG5jb25zdCBpbnZhbGlkTW9kRm9sZGVycyA9IFsnZGVuaWtzb24tYmVwaW5leHBhY2tfdmFsaGVpbScsICcxZjMxYS1iZXBpbmV4X3ZhbGhlaW1fZnVsbCddO1xyXG5jb25zdCBhcHBVbmkgPSByZW1vdGUgIT09IHVuZGVmaW5lZCA/IHJlbW90ZS5hcHAgOiBhcHA7XHJcblxyXG5pbnRlcmZhY2UgSVIyTW9kRmlsZSB7XHJcbiAgcmVsUGF0aDogc3RyaW5nO1xyXG4gIGJhc2VQYXRoOiBzdHJpbmc7XHJcbn1cclxuXHJcbi8vIFRPRE86IHJlc29sdmUgdGhlIGxvY2F0aW9uIG9mIHRoZSBjYWNoZSByYXRoZXIgdGhhbiBzZWFyY2hpbmcgZm9yIGl0IGluIHRoZVxyXG4vLyAgZGVmYXVsdCBsb2NhdGlvbi5cclxuZnVuY3Rpb24gZ2V0UjJDYWNoZUxvY2F0aW9uKCkge1xyXG4gIHJldHVybiBwYXRoLmpvaW4oYXBwVW5pLmdldFBhdGgoJ2FwcERhdGEnKSwgJ3IybW9kbWFuUGx1cy1sb2NhbCcsICdWYWxoZWltJywgJ2NhY2hlJyk7XHJcbn1cclxuXHJcbmV4cG9ydCBmdW5jdGlvbiB1c2VySGFzUjJJbnN0YWxsZWQoKSB7XHJcbiAgdHJ5IHtcclxuICAgIGZzLnN0YXRTeW5jKGdldFIyQ2FjaGVMb2NhdGlvbigpKTtcclxuICAgIHJldHVybiB0cnVlO1xyXG4gIH0gY2F0Y2ggKGVycikge1xyXG4gICAgcmV0dXJuIGZhbHNlO1xyXG4gIH1cclxufVxyXG5cclxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIG1pZ3JhdGVSMlRvVm9ydGV4KGFwaTogdHlwZXMuSUV4dGVuc2lvbkFwaSkge1xyXG4gIGNvbnN0IHN0YXJ0ID0gYXN5bmMgKCkgPT4ge1xyXG4gICAgY29uc3QgYWN0aXZpdHlJZCA9ICdyMm1pZ3JhdGlvbmFjdGl2aXR5JztcclxuICAgIGFwaS5zZW5kTm90aWZpY2F0aW9uKHtcclxuICAgICAgaWQ6IGFjdGl2aXR5SWQsXHJcbiAgICAgIHR5cGU6ICdhY3Rpdml0eScsXHJcbiAgICAgIG1lc3NhZ2U6ICdNaWdyYXRpbmcgTW9kcycsXHJcbiAgICAgIGFsbG93U3VwcHJlc3M6IGZhbHNlLFxyXG4gICAgICBub0Rpc21pc3M6IHRydWUsXHJcbiAgICB9KTtcclxuXHJcbiAgICB0cnkge1xyXG4gICAgICBhd2FpdCBzdGFydE1pZ3JhdGlvbihhcGkpO1xyXG4gICAgICBhcGkuc2VuZE5vdGlmaWNhdGlvbih7XHJcbiAgICAgICAgdHlwZTogJ3N1Y2Nlc3MnLFxyXG4gICAgICAgIG1lc3NhZ2U6ICdNb2RzIG1pZ3JhdGVkIHN1Y2Nlc3NmdWxseScsXHJcbiAgICAgICAgZGlzcGxheU1TOiAzMDAwLFxyXG4gICAgICB9KTtcclxuICAgIH0gY2F0Y2ggKGVycikge1xyXG4gICAgICBhcGkuc2hvd0Vycm9yTm90aWZpY2F0aW9uKCdGYWlsZWQgdG8gbWlncmF0ZSBtb2RzIGZyb20gUjIgTW9kIE1hbmFnZXInLCBlcnIpO1xyXG4gICAgfVxyXG5cclxuICAgIGFwaS5kaXNtaXNzTm90aWZpY2F0aW9uKGFjdGl2aXR5SWQpO1xyXG4gIH07XHJcblxyXG4gIGFwaS5zaG93RGlhbG9nKCdpbmZvJywgJ3IybW9kbWFuIE1vZHMgTWlncmF0aW9uJyxcclxuICB7XHJcbiAgICBiYmNvZGU6ICdWb3J0ZXggY2FuIGltcG9ydCB5b3VyIG1vZHMgaW5zdGFsbGVkIHdpdGggcjJtb2RtYW4gYW5kIGFsbG93IHlvdSB0byBtYW5hZ2UgdGhlbSAnXHJcbiAgICAgICsgJ2Zyb20gaW5zaWRlIFZvcnRleC4gUGxlYXNlIGJlIGF3YXJlIHRoYXQgdGhlIG1vZHMgd2lsbCBiZSBpbXBvcnRlZCBpbiBhbiAnXHJcbiAgICAgICsgJ3VuaW5zdGFsbGVkIHN0YXRlIGFuZCB3aWxsIGhhdmUgdG8gYmUgaW5zdGFsbGVkLCBlbmFibGVkIGFuZCBkZXBsb3llZCB0aHJvdWdoICdcclxuICAgICAgKyAnVm9ydGV4IGJlZm9yZSB0aGUgbW9kcyBhcmUgcmUtaW5zdGF0ZWQgaW50byB0aGUgZ2FtZS5bYnJdWy9icl1bYnJdWy9icl0nXHJcbiAgICAgICsgJ1BsZWFzZSBub3RlOiBbYnJdWy9icl1bYnJdWy9icl1bbGlzdF0nXHJcbiAgICAgICsgJ1sqXU1vZCBjb25maWd1cmF0aW9uIGNoYW5nZXMgd2lsbCBub3QgYmUgaW1wb3J0ZWQgLSB0aGVzZSBuZWVkIHRvIGJlICdcclxuICAgICAgKyAncmUtYWRkZWQgb3IgaW1wb3J0ZWQgbWFudWFsbHkgZnJvbSB5b3VyIHByZWZlcnJlZCByMm1vZG1hbiBwcm9maWxlLidcclxuICAgICAgKyAnWypdVm9ydGV4IHdpbGwgaW1wb3J0IEFMTCB2ZXJzaW9ucyBvZiB0aGUgbW9kcyB5b3UgaGF2ZSBpbiB5b3VyIHIybW9kbWFuIGNhY2hlLCBldmVuICdcclxuICAgICAgKyAndGhlIG91dGRhdGVkIG9uZXMgLSBpdFxcJ3MgdXAgdG8geW91IHRvIGxvb2sgdGhyb3VnaCB0aGUgaW1wb3J0ZWQgbW9kcyBhbmQgaW5zdGFsbCAnXHJcbiAgICAgICsgJ3RoZSBvbmVzIHlvdSB3YW50IGFjdGl2ZSBpbi1nYW1lLidcclxuICAgICAgKyAnWypdcjJtb2RtYW4gc3RvcmVzIHJlY2VudGx5IHVuaW5zdGFsbGVkIG1vZHMgaW4gaXRzIGNhY2hlIG1lYW5pbmcgdGhhdCBWb3J0ZXggbWlnaHQgJ1xyXG4gICAgICArICdpbXBvcnQgbW9kcyB5b3UgcmVjZW50bHkgdW5pbnN0YWxsZWQgaW4gcjJtb2RtYW4uIFlvdSBjYW4gc2ltcGx5IGNob29zZSB0byBub3QgJ1xyXG4gICAgICArICdpbnN0YWxsIG9yIHJlbW92ZSB0aGVtIGVudGlyZWx5IGFmdGVyIGltcG9ydGluZy4gJ1xyXG4gICAgICArICdbL2xpc3RdW2JyXVsvYnJdSXQgaXMgc3RpbGwgaGlnaGx5IHJlY29tbWVuZGVkIHRvIHVzZSBhIGZyZXNoIHZhbmlsbGEgY29weSBvZiB0aGUgZ2FtZSB3aGVuICdcclxuICAgICAgKyAnc3RhcnRpbmcgdG8gbW9kIHdpdGggVm9ydGV4LicsXHJcbiAgfSwgW1xyXG4gICAgeyBsYWJlbDogJ0NhbmNlbCcsIGFjdGlvbjogKCkgPT4gUHJvbWlzZS5yZXNvbHZlKCkgfSxcclxuICAgIHsgbGFiZWw6ICdTdGFydCBNaWdyYXRpb24nLCBhY3Rpb246ICgpID0+IHN0YXJ0KCkgfSxcclxuICBdKTtcclxufVxyXG5cclxuYXN5bmMgZnVuY3Rpb24gc3RhcnRNaWdyYXRpb24oYXBpOiB0eXBlcy5JRXh0ZW5zaW9uQXBpKSB7XHJcbiAgY29uc3QgaGFzSW52YWxpZFNlZyA9IChzZWdtZW50OiBzdHJpbmcpID0+XHJcbiAgICBbRE9PUlNUT1BQRVJfSE9PS10uY29uY2F0KGludmFsaWRNb2RGb2xkZXJzLCBJR05PUkFCTEVfRklMRVMpLmluY2x1ZGVzKHNlZ21lbnQudG9Mb3dlckNhc2UoKSk7XHJcblxyXG4gIGNvbnN0IHN0YXRlID0gYXBpLmdldFN0YXRlKCk7XHJcbiAgY29uc3QgZGlzY292ZXJ5OiB0eXBlcy5JRGlzY292ZXJ5UmVzdWx0ID0gc2VsZWN0b3JzLmRpc2NvdmVyeUJ5R2FtZShzdGF0ZSwgR0FNRV9JRCk7XHJcbiAgaWYgKGRpc2NvdmVyeT8ucGF0aCA9PT0gdW5kZWZpbmVkKSB7XHJcbiAgICAvLyBTaG91bGQgbmV2ZXIgYmUgcG9zc2libGUuXHJcbiAgICByZXR1cm47XHJcbiAgfVxyXG5cclxuICBjb25zdCByMlBhdGggPSBnZXRSMkNhY2hlTG9jYXRpb24oKTtcclxuICBsZXQgZmlsZUVudHJpZXM6IElFbnRyeVtdID0gW107XHJcbiAgYXdhaXQgdHVyYm93YWxrKHIyUGF0aCwgZW50cmllcyA9PiB7XHJcbiAgICBjb25zdCBmaWx0ZXJlZCA9IGVudHJpZXMuZmlsdGVyKGVudHJ5ID0+IHtcclxuICAgICAgaWYgKGVudHJ5LmlzRGlyZWN0b3J5KSB7XHJcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xyXG4gICAgICB9XHJcbiAgICAgIGNvbnN0IHNlZ21lbnRzID0gZW50cnkuZmlsZVBhdGguc3BsaXQocGF0aC5zZXApO1xyXG4gICAgICBjb25zdCBpc0ludmFsaWQgPSBzZWdtZW50cy5maW5kKGhhc0ludmFsaWRTZWcpICE9PSB1bmRlZmluZWQ7XHJcbiAgICAgIGlmIChpc0ludmFsaWQpIHtcclxuICAgICAgICByZXR1cm4gZmFsc2U7XHJcbiAgICAgIH1cclxuICAgICAgcmV0dXJuIHRydWU7XHJcbiAgICB9KTtcclxuICAgIGZpbGVFbnRyaWVzID0gZmlsZUVudHJpZXMuY29uY2F0KGZpbHRlcmVkKTtcclxuICB9KVxyXG4gIC5jYXRjaChlcnIgPT4gWydFTk9FTlQnLCAnRU5PVEZPVU5EJ10uaW5jbHVkZXMoZXJyLmNvZGUpXHJcbiAgICA/IFByb21pc2UucmVzb2x2ZSgpIDogUHJvbWlzZS5yZWplY3QoZXJyKSk7XHJcblxyXG4gIGNvbnN0IHZlclJneCA9IG5ldyBSZWdFeHAoL15cXGRcXC5cXGRcXC5cXGR7MSw0fSQvKTtcclxuICAvL2NvbnN0IGRlc3RpbmF0aW9uID0gcGF0aC5qb2luKGRpc2NvdmVyeS5wYXRoLCAnQmVwSW5FeCcsICdwbHVnaW5zJyk7XHJcbiAgLy8gdHNsaW50OmRpc2FibGUtbmV4dC1saW5lOiBtYXgtbGluZS1sZW5ndGhcclxuICBjb25zdCBhcmNNYXA6IHsgW2FyY05hbWU6IHN0cmluZ106IElSMk1vZEZpbGVbXSB9ID0gZmlsZUVudHJpZXMucmVkdWNlKChhY2N1bSwgaXRlcikgPT4ge1xyXG4gICAgY29uc3Qgc2VnbWVudHMgPSBpdGVyLmZpbGVQYXRoLnNwbGl0KHBhdGguc2VwKTtcclxuICAgIGNvbnN0IGlkeCA9IHNlZ21lbnRzLmZpbmRJbmRleChzZWcgPT4gdmVyUmd4LnRlc3Qoc2VnKSk7XHJcbiAgICBpZiAoaWR4ID09PSAtMSkge1xyXG4gICAgICAvLyBUaGlzIGlzIGFuIGludmFsaWQgZmlsZSBlbnRyeSwgYXQgbGVhc3QgYXMgZmFyIGFzIHRoZSBSMiBjYWNoZSBmaWxlXHJcbiAgICAgIC8vIHN0cnVjdHVyZSB3YXMgaW4gMDIvMDMvMjAyMTtcclxuICAgICAgcmV0dXJuIGFjY3VtO1xyXG4gICAgfVxyXG4gICAgY29uc3QgbW9kS2V5ID0gc2VnbWVudHMuc2xpY2UoaWR4IC0gMSwgaWR4ICsgMSkuam9pbignXycpO1xyXG4gICAgaWYgKGFjY3VtW21vZEtleV0gPT09IHVuZGVmaW5lZCkge1xyXG4gICAgICBhY2N1bVttb2RLZXldID0gW107XHJcbiAgICB9XHJcbiAgICBjb25zdCBiYXNlUGF0aCA9IHNlZ21lbnRzLnNsaWNlKDAsIGlkeCArIDEpLmpvaW4ocGF0aC5zZXApO1xyXG4gICAgY29uc3QgcmVsUGF0aCA9IHBhdGgucmVsYXRpdmUoYmFzZVBhdGgsIGl0ZXIuZmlsZVBhdGgpO1xyXG4gICAgY29uc3QgcGF0aEV4aXN0cyA9IChhY2N1bVttb2RLZXldLmZpbmQocjJmaWxlID0+XHJcbiAgICAgIHIyZmlsZS5yZWxQYXRoLnNwbGl0KHBhdGguc2VwKVswXSA9PT0gcmVsUGF0aC5zcGxpdChwYXRoLnNlcClbMF0pICE9PSB1bmRlZmluZWQpO1xyXG4gICAgaWYgKCFwYXRoRXhpc3RzKSB7XHJcbiAgICAgIGFjY3VtW21vZEtleV0ucHVzaCh7IHJlbFBhdGgsIGJhc2VQYXRoIH0pO1xyXG4gICAgfVxyXG4gICAgcmV0dXJuIGFjY3VtO1xyXG4gIH0sIHt9KTtcclxuXHJcbiAgY29uc3QgZG93bmxvYWRzUGF0aCA9IHNlbGVjdG9ycy5kb3dubG9hZFBhdGhGb3JHYW1lKHN0YXRlLCBHQU1FX0lEKTtcclxuICBjb25zdCBzemlwID0gbmV3IHV0aWwuU2V2ZW5aaXAoKTtcclxuICBmb3IgKGNvbnN0IG1vZEtleSBvZiBPYmplY3Qua2V5cyhhcmNNYXApKSB7XHJcbiAgICBjb25zdCBhcmNoaXZlUGF0aCA9IHBhdGguam9pbihkb3dubG9hZHNQYXRoLCBtb2RLZXkgKyAnLnppcCcpO1xyXG4gICAgYXdhaXQgc3ppcC5hZGQoYXJjaGl2ZVBhdGgsIGFyY01hcFttb2RLZXldXHJcbiAgICAgIC5tYXAocjJNb2RGaWxlID0+IHBhdGguam9pbihyMk1vZEZpbGUuYmFzZVBhdGgsIHIyTW9kRmlsZS5yZWxQYXRoLnNwbGl0KHBhdGguc2VwKVswXSkpLCB7IHJhdzogWyctciddIH0pO1xyXG4gIH1cclxufVxyXG4iXX0=