import Foundation
import Capacitor
import SumUpSDK
import UIKit

// -----------------------------------------------------------------------------
// SumupTapToPayPlugin — bridge entre el JS de la app (Capacitor) y el iOS SDK
// nativo de SumUp para hacer cobros con Tap to Pay on iPhone.
//
// El JS llama:
//   SumupTapToPay.loginWithToken({ accessToken })
//   SumupTapToPay.isAvailable() → { available, activated }
//   SumupTapToPay.activate()    → activación Apple ID + cuenta SumUp
//   SumupTapToPay.checkout({ amount, title, foreignTransactionId })
//
// Requisitos runtime:
//   · iPhone XS o superior, iOS 16.4+ (idealmente 17.5+)
//   · Entitlement com.apple.developer.proximity-reader.payment.acceptance
//   · Cuenta SumUp activada para Tap to Pay (lo gestiona la propia activación)
// -----------------------------------------------------------------------------

@objc(SumupTapToPayPlugin)
public class SumupTapToPayPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "SumupTapToPayPlugin"
    public let jsName = "SumupTapToPay"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "loginWithToken", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "logout", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isLoggedIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isAvailable", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "activate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "checkout", returnType: CAPPluginReturnPromise),
    ]

    @objc func loginWithToken(_ call: CAPPluginCall) {
        guard let accessToken = call.getString("accessToken") else {
            call.reject("Falta accessToken")
            return
        }
        SumUpSDK.login(withToken: accessToken) { success, error in
            if let error = error {
                call.reject(error.localizedDescription, nil, error)
                return
            }
            call.resolve(["success": success])
        }
    }

    @objc func logout(_ call: CAPPluginCall) {
        SumUpSDK.logout { success, error in
            if let error = error {
                call.reject(error.localizedDescription, nil, error)
                return
            }
            call.resolve(["success": success])
        }
    }

    @objc func isLoggedIn(_ call: CAPPluginCall) {
        call.resolve(["loggedIn": SumUpSDK.isLoggedIn])
    }

    @objc func isAvailable(_ call: CAPPluginCall) {
        SumUpSDK.checkTapToPayAvailability { isAvailable, isActivated, error in
            if let error = error {
                call.reject(error.localizedDescription, nil, error)
                return
            }
            call.resolve([
                "available": isAvailable,
                "activated": isActivated,
            ])
        }
    }

    @objc func activate(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else {
                call.reject("No hay UIViewController disponible para presentar la activación")
                return
            }
            SumUpSDK.presentTapToPayActivation(from: presenter, animated: true) { success, error in
                if let error = error {
                    call.reject(error.localizedDescription, nil, error)
                    return
                }
                call.resolve(["activated": success])
            }
        }
    }

    @objc func checkout(_ call: CAPPluginCall) {
        guard let amount = call.getDouble("amount") else {
            call.reject("Falta amount (en EUR)")
            return
        }
        let title = call.getString("title") ?? "Cobro otracita"
        let currency = call.getString("currency") ?? "EUR"
        let foreignTransactionId = call.getString("foreignTransactionId")

        let request = CheckoutRequest(
            total: NSDecimalNumber(value: amount),
            title: title,
            currencyCode: currency,
            paymentMethod: .tapToPay
        )
        if let foreignId = foreignTransactionId {
            request.foreignTransactionID = foreignId
        }

        DispatchQueue.main.async {
            guard let presenter = self.bridge?.viewController else {
                call.reject("No hay UIViewController para presentar el checkout")
                return
            }
            SumUpSDK.checkout(with: request, from: presenter) { result, error in
                if let error = error {
                    call.reject(error.localizedDescription, nil, error)
                    return
                }
                guard let result = result else {
                    call.reject("Checkout devolvió un resultado vacío")
                    return
                }
                var payload: [String: Any] = [
                    "success": result.success,
                ]
                if let txCode = result.transactionCode {
                    payload["transactionCode"] = txCode
                }
                if let info = result.additionalInfo {
                    payload["additionalInfo"] = info
                }
                call.resolve(payload)
            }
        }
    }
}
