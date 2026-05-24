// -----------------------------------------------------------------------------
// wallet/web-service-auth — validador laxo del header Authorization en
// endpoints PassKit Web Service.
//
// Apple manda `Authorization: ApplePass <authenticationToken>` en cada
// request. V1: solo verificamos que la cabecera tiene la forma correcta
// (existe + empieza por "ApplePass "). NO comparamos el token contra DB
// porque V1 no persiste tokens — eso entra en V1.5 junto con la tabla
// `wallet_passes`.
//
// TODO V1.5: lookup del token contra wallet_passes.authenticationToken,
// devolver 401 si no coincide para [passTypeIdentifier]/[serialNumber].
// -----------------------------------------------------------------------------

export function validateBearerOrLog(req: Request): boolean {
  const auth =
    req.headers.get('authorization') ?? req.headers.get('Authorization')
  if (!auth || !/^ApplePass\s+\S+/.test(auth)) {
    // No bloqueamos en V1; solo dejamos rastro para debugging.
    console.warn(
      '[wallet][stub] request sin Authorization válida — V1.5 enforcement pendiente',
    )
    return false
  }
  return true
}
