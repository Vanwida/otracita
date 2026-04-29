#import <Foundation/Foundation.h>
#import <Capacitor/Capacitor.h>

// Macro de Capacitor que registra el plugin Swift en el runtime ObjC.
// Necesario porque Capacitor invoca métodos Swift vía selectors.
CAP_PLUGIN(SumupTapToPayPlugin, "SumupTapToPay",
    CAP_PLUGIN_METHOD(loginWithToken, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(logout, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(isLoggedIn, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(isAvailable, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(activate, CAPPluginReturnPromise);
    CAP_PLUGIN_METHOD(checkout, CAPPluginReturnPromise);
)
