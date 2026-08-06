// Compatibility aliases while legacy host components move behind the package
// boundary. New consumers import WebIDEHostContext/useWebIDEHost publicly.
export {
  useWebIDEHost as useIDEHost,
} from 'web-ide/host'
