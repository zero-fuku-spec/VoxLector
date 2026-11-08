export type PermissionPurpose = 'documents' | 'photos'

const REQUESTED_KEY = 'has_requested_storage_permission'

export const PermissionsService = {
  hasRequestedStoragePermission(): boolean {
    try {
      if (localStorage.getItem(REQUESTED_KEY) === 'true') return true
      const wasPreviouslyRequested = localStorage.getItem('storage_permission_dismissed') === 'true'
        || localStorage.getItem('documents_permission_granted') === 'true'
      if (wasPreviouslyRequested) this.markStoragePermissionRequested()
      return wasPreviouslyRequested
    } catch (error) {
      console.error('[VoxLector] No se pudo consultar el estado del aviso de almacenamiento:', error)
      throw new Error('No se pudo comprobar si ya se mostró el aviso de almacenamiento.')
    }
  },

  markStoragePermissionRequested(): void {
    try {
      localStorage.setItem(REQUESTED_KEY, 'true')
    } catch (error) {
      console.error('[VoxLector] No se pudo guardar el estado del aviso de almacenamiento:', error)
      throw new Error('No se pudo guardar que el aviso de almacenamiento ya fue mostrado.')
    }
  },

  hasRequestedPhotoPermission(): boolean {
    try {
      return localStorage.getItem('photos_permission_granted') === 'true'
    } catch (error) {
      console.error('[VoxLector] No se pudo consultar el estado del aviso de fotos:', error)
      throw new Error('No se pudo comprobar si ya se mostró el aviso de fotos.')
    }
  },

  markPhotoPermissionRequested(): void {
    try {
      localStorage.setItem('photos_permission_granted', 'true')
    } catch (error) {
      console.error('[VoxLector] No se pudo guardar el estado del aviso de fotos:', error)
      throw new Error('No se pudo guardar que el aviso de fotos ya fue mostrado.')
    }
  },
}
