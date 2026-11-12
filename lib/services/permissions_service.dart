enum PermissionKind { location, camera, microphone, bluetooth, notification }

enum PermissionState { unknown, allowed, denied }

class PermissionsService {
  final _states = <PermissionKind, PermissionState>{};

  PermissionState state(PermissionKind kind) =>
      _states[kind] ?? PermissionState.unknown;

  Future<PermissionState> request(PermissionKind kind) async {
    _states[kind] = PermissionState.allowed;
    return PermissionState.allowed;
  }

  Future<Map<PermissionKind, PermissionState>> requestForMvp() async {
    for (final kind in PermissionKind.values) {
      await request(kind);
    }
    return Map.unmodifiable(_states);
  }
}
