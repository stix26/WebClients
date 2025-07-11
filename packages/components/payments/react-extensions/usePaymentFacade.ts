import { useMemo, useRef } from 'react';

import type {
    AmountAndCurrency,
    BillingAddress,
    ChargeablePaymentParameters,
    ChargebeeIframeEvents,
    ChargebeeIframeHandles,
    ChargebeeKillSwitch,
    ChargebeePaypalModalHandles,
    ForceEnableChargebee,
    PaymentMethodFlows,
    PaymentMethodStatusExtended,
    PaymentMethodType,
    PaymentVerificator,
    PaymentVerificatorV5,
    PaymentsVersion,
    PlainPaymentMethodType,
    SavedPaymentMethod,
} from '@proton/payments';
import {
    type ADDON_NAMES,
    type BillingPlatform,
    type Currency,
    type Cycle,
    PAYMENT_METHOD_TYPES,
    type PLANS,
    type PlanIDs,
    type Subscription,
    buyCredit,
    canUseChargebee,
    isExistingPaymentMethod,
    isOnSessionMigration,
    isSplittedUser,
    payInvoice,
    setPaymentMethodV5,
    subscribe,
} from '@proton/payments';
import type { ProductParam } from '@proton/shared/lib/apps/product';
import type { Api, ChargebeeEnabled, ChargebeeUserExists, User } from '@proton/shared/lib/interfaces';

import type { PaymentProcessorType } from './interface';
import useBitcoin from './useBitcoin';
import { useCard } from './useCard';
import { useChargebeeCard } from './useChargebeeCard';
import { useChargebeePaypal } from './useChargebeePaypal';
import type { OnMethodChangedHandler } from './useMethods';
import { useMethods } from './useMethods';
import { usePaymentsApi } from './usePaymentsApi';
import { usePaypal } from './usePaypal';
import { useSavedChargebeeMethod } from './useSavedChargebeeMethod';
import { useSavedMethod } from './useSavedMethod';
import { useSepaDirectDebit } from './useSepaDirectDebit';

export interface OperationsSubscriptionData {
    Plans: PlanIDs;
    Cycle: Cycle;
    Codes?: string[];
    product: ProductParam;
    taxBillingAddress: BillingAddress;
}

export interface OperationsInvoiceData {
    invoiceId: string;
}

export interface OperationsData {
    subscription?: OperationsSubscriptionData;
    invoice?: OperationsInvoiceData;
}

/**
 * Common operations that can be performed with a chargeable payment token. The operations are ment to be available in
 * onChargeable callback.
 */
export interface Operations {
    buyCredit: () => Promise<unknown>;
    payInvoice: (invoiceId: string, paymentsVersion?: PaymentsVersion) => Promise<unknown>;
    subscribe: (operationsDataParam?: OperationsSubscriptionData) => Promise<unknown>;
    savePaymentMethod: () => Promise<unknown>;
}

function getOperations(
    api: Api,
    params: ChargeablePaymentParameters,
    operationsData: OperationsData,
    paymentsVersion: PaymentsVersion,
    afterOperation?: () => void
): Operations {
    const wrappedAfterOperation = <T>(result: T) => {
        afterOperation?.();
        return result;
    };

    return {
        buyCredit: async () => {
            return api(buyCredit(params, paymentsVersion)).then(wrappedAfterOperation);
        },
        payInvoice: async (invoiceId: string, versionOverride?: PaymentsVersion) => {
            return api(payInvoice(invoiceId, params, versionOverride ?? paymentsVersion)).then(wrappedAfterOperation);
        },
        subscribe: async (operationsDataParam?: OperationsSubscriptionData) => {
            if (!operationsData?.subscription && !operationsDataParam) {
                throw new Error('The operations data for subscription must be provided in the facade');
            }

            const { product, taxBillingAddress, ...data } = (operationsData.subscription ??
                operationsDataParam) as OperationsSubscriptionData;

            const BillingAddress: BillingAddress = {
                State: taxBillingAddress.State,
                CountryCode: taxBillingAddress.CountryCode,
            };

            return api(
                subscribe(
                    {
                        PaymentToken: params.PaymentToken,
                        BillingAddress,
                        ...params,
                        ...data,
                    },
                    product,
                    paymentsVersion
                )
            ).then(wrappedAfterOperation);
        },
        savePaymentMethod: async () => {
            const PaymentToken = params.PaymentToken;
            if (!PaymentToken) {
                throw new Error('Could not save payment method without a payment token');
            }

            return api(
                setPaymentMethodV5({
                    PaymentToken,
                    v: 5,
                })
            );
        },
    };
}

/**
 * Stores the data for operations. That's meant to bypass React's rendering cycle.
 * Perhaps will be changed in the future.
 */
const usePaymentContext = () => {
    const subscriptionData = useRef<OperationsSubscriptionData>();

    return {
        setSubscriptionData: (data: OperationsSubscriptionData | undefined) => {
            subscriptionData.current = data;
        },
        getSubscriptionData: () => {
            return subscriptionData.current;
        },
        getOperationsData: (): OperationsData => {
            return {
                subscription: subscriptionData.current,
            };
        },
    };
};

/**
 * The idea of this hook is gather together all the payment methods and their implementation and provide some
 * meaningful default configurations. This facade might be reused in other apps (like static) in the future.
 * The implementation attempts to avoid dependencies on the monorepo's client-specific code. There are still some
 * leftovers that might be removed later.
 */
export const usePaymentFacade = (
    {
        amount,
        currency,
        onChargeable,
        coupon,
        flow,
        onMethodChanged,
        paymentMethods,
        paymentMethodStatusExtended,
        isChargebeeEnabled,
        chargebeeKillSwitch,
        forceEnableChargebee,
        selectedPlanName,
        onProcessPaymentToken,
        onProcessPaymentTokenFailed,
        billingAddress,
        billingPlatform,
        chargebeeUserExists,
        forceInhouseSavedMethodProcessors,
        disableNewPaymentMethods,
        onCurrencyChange,
        user,
        enableSepa,
        onBeforeSepaPayment,
        planIDs,
        subscription,
        isTrial,
    }: {
        amount: number;
        currency: Currency;
        onChargeable: (
            operations: Operations,
            data: {
                chargeablePaymentParameters: ChargeablePaymentParameters;
                source: PaymentMethodType;
                sourceType: PlainPaymentMethodType;
                context: OperationsData;
                paymentsVersion: PaymentsVersion;
                paymentProcessorType: PaymentProcessorType;
            }
        ) => Promise<unknown>;
        coupon?: string;
        flow: PaymentMethodFlows;
        onMethodChanged?: OnMethodChangedHandler;
        paymentMethods?: SavedPaymentMethod[];
        paymentMethodStatusExtended?: PaymentMethodStatusExtended;
        isChargebeeEnabled: () => ChargebeeEnabled;
        chargebeeKillSwitch: ChargebeeKillSwitch;
        forceEnableChargebee: ForceEnableChargebee;
        selectedPlanName: PLANS | ADDON_NAMES | undefined;
        onProcessPaymentToken: (paymentMethodType: PaymentProcessorType) => void;
        onProcessPaymentTokenFailed: (paymentMethodType: PaymentProcessorType) => void;
        billingAddress?: BillingAddress;
        billingPlatform?: BillingPlatform;
        chargebeeUserExists?: ChargebeeUserExists;
        forceInhouseSavedMethodProcessors?: boolean;
        disableNewPaymentMethods?: boolean;
        onCurrencyChange?: (
            currency: Currency,
            context: {
                paymentMethodType: PlainPaymentMethodType;
            }
        ) => void;
        user: User | undefined;
        enableSepa?: boolean;
        onBeforeSepaPayment?: () => Promise<boolean>;
        planIDs?: PlanIDs;
        subscription?: Subscription;
        isTrial?: boolean;
    },
    {
        api,
        isAuthenticated,
        verifyPayment,
        verifyPaymentPaypal,
        verifyPaymentChargebeeCard,
        chargebeeHandles,
        chargebeeEvents,
        chargebeePaypalModalHandles,
    }: {
        api: Api;
        isAuthenticated: boolean;
        verifyPayment: PaymentVerificator;
        verifyPaymentPaypal: PaymentVerificator;
        verifyPaymentChargebeeCard: PaymentVerificatorV5;
        chargebeeHandles: ChargebeeIframeHandles;
        chargebeeEvents: ChargebeeIframeEvents;
        chargebeePaypalModalHandles?: ChargebeePaypalModalHandles;
    }
) => {
    const amountAndCurrency: AmountAndCurrency = useMemo(
        () => ({
            Amount: amount,
            Currency: currency,
        }),
        [amount, currency]
    );

    const paymentContext = usePaymentContext();
    const { paymentsApi } = usePaymentsApi(api);

    const methods = useMethods(
        {
            amount,
            currency,
            coupon: coupon ?? '',
            flow,
            onMethodChanged,
            paymentMethods,
            paymentMethodStatusExtended,
            isChargebeeEnabled,
            paymentsApi,
            selectedPlanName,
            billingAddress,
            billingPlatform,
            chargebeeUserExists,
            disableNewPaymentMethods,
            onCurrencyChange,
            enableSepa,
            user,
            planIDs,
            subscription,
        },
        {
            api,
            isAuthenticated,
        }
    );

    const savedMethod = useSavedMethod(
        {
            amountAndCurrency,
            savedMethod: methods.savedSelectedMethod,
            onProcessPaymentToken,
            onProcessPaymentTokenFailed,
            onChargeable: (params, paymentMethodId) =>
                onChargeable(
                    getOperations(api, params, paymentContext.getOperationsData(), 'v4', chargebeeKillSwitch),
                    {
                        chargeablePaymentParameters: params,
                        source: paymentMethodId,
                        sourceType: params.type,
                        context: paymentContext.getOperationsData(),
                        paymentsVersion: 'v4',
                        paymentProcessorType: savedMethod.meta.type,
                    }
                ),
        },
        {
            api,
            verifyPayment,
        }
    );

    const savedChargebeeMethod = useSavedChargebeeMethod(
        {
            amountAndCurrency,
            savedMethod: methods.savedSelectedMethod,
            onProcessPaymentToken,
            onProcessPaymentTokenFailed,
            onBeforeSepaPayment,
            onChargeable: (params, paymentMethodId) =>
                onChargeable(
                    getOperations(api, params, paymentContext.getOperationsData(), 'v5', forceEnableChargebee),
                    {
                        chargeablePaymentParameters: params,
                        source: paymentMethodId,
                        sourceType: params.type,
                        context: paymentContext.getOperationsData(),
                        paymentsVersion: 'v5',
                        paymentProcessorType: savedChargebeeMethod.meta.type,
                    }
                ),
        },
        {
            api,
            verifyPayment: verifyPaymentChargebeeCard,
            handles: chargebeeHandles,
            events: chargebeeEvents,
        }
    );

    const card = useCard(
        {
            amountAndCurrency,
            onProcessPaymentToken,
            onProcessPaymentTokenFailed,
            onChargeable: (params) =>
                onChargeable(
                    getOperations(api, params, paymentContext.getOperationsData(), 'v4', chargebeeKillSwitch),
                    {
                        chargeablePaymentParameters: params,
                        source: PAYMENT_METHOD_TYPES.CARD,
                        sourceType: params.type,
                        context: paymentContext.getOperationsData(),
                        paymentsVersion: 'v4',
                        paymentProcessorType: card.meta.type,
                    }
                ),
            verifyOnly: flow === 'add-card',
        },
        {
            api,
            verifyPayment,
        }
    );

    const paypalIgnoreAmountCheck = flow === 'invoice';
    const paypal = usePaypal(
        {
            amountAndCurrency,
            isCredit: false,
            onProcessPaymentToken,
            onProcessPaymentTokenFailed,
            onChargeable: (params) =>
                onChargeable(
                    getOperations(api, params, paymentContext.getOperationsData(), 'v4', chargebeeKillSwitch),
                    {
                        chargeablePaymentParameters: params,
                        source: PAYMENT_METHOD_TYPES.PAYPAL,
                        sourceType: params.type,
                        context: paymentContext.getOperationsData(),
                        paymentsVersion: 'v4',
                        paymentProcessorType: paypal.meta.type,
                    }
                ),
            ignoreAmountCheck: paypalIgnoreAmountCheck,
        },
        {
            api,
            verifyPayment: verifyPaymentPaypal,
        }
    );

    const paypalCredit = usePaypal(
        {
            amountAndCurrency,
            isCredit: true,
            onProcessPaymentToken,
            onProcessPaymentTokenFailed,
            onChargeable: (params) =>
                onChargeable(
                    getOperations(api, params, paymentContext.getOperationsData(), 'v4', chargebeeKillSwitch),
                    {
                        chargeablePaymentParameters: params,
                        source: PAYMENT_METHOD_TYPES.PAYPAL_CREDIT,
                        sourceType: params.type,
                        context: paymentContext.getOperationsData(),
                        paymentsVersion: 'v4',
                        paymentProcessorType: paypalCredit.meta.type,
                    }
                ),
            ignoreAmountCheck: paypalIgnoreAmountCheck,
        },
        {
            api,
            verifyPayment: verifyPaymentPaypal,
        }
    );

    const chargebeeCard = useChargebeeCard(
        {
            amountAndCurrency,
            onProcessPaymentToken,
            onProcessPaymentTokenFailed,
            onChargeable: (params) =>
                onChargeable(
                    getOperations(api, params, paymentContext.getOperationsData(), 'v5', forceEnableChargebee),
                    {
                        chargeablePaymentParameters: params,
                        source: PAYMENT_METHOD_TYPES.CHARGEBEE_CARD,
                        sourceType: params.type,
                        context: paymentContext.getOperationsData(),
                        paymentsVersion: 'v5',
                        paymentProcessorType: chargebeeCard.meta.type,
                    }
                ),
            verifyOnly: flow === 'add-card' || isTrial,
        },
        {
            api,
            verifyPayment: verifyPaymentChargebeeCard,
            handles: chargebeeHandles,
            events: chargebeeEvents,
            forceEnableChargebee,
        }
    );

    const chargebeePaypal = useChargebeePaypal(
        {
            amountAndCurrency,
            isCredit: false,
            onChargeable: (params) =>
                onChargeable(
                    getOperations(api, params, paymentContext.getOperationsData(), 'v5', forceEnableChargebee),
                    {
                        chargeablePaymentParameters: params,
                        source: PAYMENT_METHOD_TYPES.CHARGEBEE_PAYPAL,
                        sourceType: params.type,
                        context: paymentContext.getOperationsData(),
                        paymentsVersion: 'v5',
                        paymentProcessorType: chargebeePaypal.meta.type,
                    }
                ),
        },
        {
            api,
            verifyPayment: verifyPaymentChargebeeCard,
            handles: chargebeeHandles,
            events: chargebeeEvents,
            chargebeePaypalModalHandles,
            forceEnableChargebee,
        }
    );

    const paymentMethodValue: PaymentMethodType | undefined = methods.selectedMethod?.value;
    const bitcoinInhouse = useBitcoin({
        api,
        Amount: amount,
        Currency: currency,
        enablePolling: paymentMethodValue === PAYMENT_METHOD_TYPES.BITCOIN,
        paymentsVersion: 'v4',
        onTokenValidated: (params: ChargeablePaymentParameters) => {
            return onChargeable(
                getOperations(api, params, paymentContext.getOperationsData(), 'v4', chargebeeKillSwitch),
                {
                    chargeablePaymentParameters: params,
                    source: PAYMENT_METHOD_TYPES.BITCOIN,
                    sourceType: params.type,
                    context: paymentContext.getOperationsData(),
                    paymentsVersion: 'v4',
                    paymentProcessorType: bitcoinInhouse.meta.type,
                }
            );
        },
    });

    const bitcoinChargebee = useBitcoin({
        api,
        Amount: amount,
        Currency: currency,
        enablePolling: paymentMethodValue === PAYMENT_METHOD_TYPES.CHARGEBEE_BITCOIN,
        paymentsVersion: 'v5',
        billingAddress,
        onTokenValidated: (params: ChargeablePaymentParameters) => {
            return onChargeable(
                getOperations(api, params, paymentContext.getOperationsData(), 'v5', forceEnableChargebee),
                {
                    chargeablePaymentParameters: params,
                    source: PAYMENT_METHOD_TYPES.CHARGEBEE_BITCOIN,
                    sourceType: params.type,
                    context: paymentContext.getOperationsData(),
                    paymentsVersion: 'v5',
                    paymentProcessorType: bitcoinChargebee.meta.type,
                }
            );
        },
    });

    const directDebit = useSepaDirectDebit(
        {
            amountAndCurrency,
            selectedPlanName,
            onBeforeSepaPayment,
            onChargeable: (params) => {
                return onChargeable(
                    getOperations(api, params, paymentContext.getOperationsData(), 'v5', forceEnableChargebee),
                    {
                        chargeablePaymentParameters: params,
                        source: PAYMENT_METHOD_TYPES.CHARGEBEE_SEPA_DIRECT_DEBIT,
                        sourceType: params.type,
                        context: paymentContext.getOperationsData(),
                        paymentsVersion: 'v5',
                        paymentProcessorType: PAYMENT_METHOD_TYPES.CHARGEBEE_SEPA_DIRECT_DEBIT,
                    }
                );
            },
        },
        {
            api,
            forceEnableChargebee,
            handles: chargebeeHandles,
            events: chargebeeEvents,
            verifyPayment: verifyPaymentChargebeeCard,
        }
    );

    const onSessionMigration = isOnSessionMigration(isChargebeeEnabled(), billingPlatform);
    const splittedUser = isSplittedUser(isChargebeeEnabled(), chargebeeUserExists, billingPlatform);
    const creditFlowBeforeMigration = flow === 'credit' && onSessionMigration && !splittedUser;

    const paymentMethodType: PlainPaymentMethodType | undefined = methods.selectedMethod?.type;
    const selectedProcessor = useMemo(() => {
        if (isExistingPaymentMethod(paymentMethodValue)) {
            if (forceInhouseSavedMethodProcessors) {
                return savedMethod;
            }

            if (
                // If Chargebee is allowed and the saved method is internal (migration mode), then we use the
                // saved Chargebee method processor.
                (canUseChargebee(isChargebeeEnabled()) && !creditFlowBeforeMigration) ||
                paymentMethodType === PAYMENT_METHOD_TYPES.CHARGEBEE_CARD ||
                paymentMethodType === PAYMENT_METHOD_TYPES.CHARGEBEE_PAYPAL
            ) {
                return savedChargebeeMethod;
            } else if (
                paymentMethodType === PAYMENT_METHOD_TYPES.CARD ||
                paymentMethodType === PAYMENT_METHOD_TYPES.PAYPAL
            ) {
                return savedMethod;
            }
        }

        if (paymentMethodValue === PAYMENT_METHOD_TYPES.CARD) {
            return card;
        }

        if (paymentMethodValue === PAYMENT_METHOD_TYPES.PAYPAL) {
            return paypal;
        }

        if (paymentMethodValue === PAYMENT_METHOD_TYPES.PAYPAL_CREDIT) {
            return paypalCredit;
        }

        if (paymentMethodValue === PAYMENT_METHOD_TYPES.CHARGEBEE_CARD) {
            return chargebeeCard;
        }

        if (paymentMethodValue === PAYMENT_METHOD_TYPES.CHARGEBEE_PAYPAL) {
            return chargebeePaypal;
        }

        if (paymentMethodValue === PAYMENT_METHOD_TYPES.BITCOIN) {
            return bitcoinInhouse;
        }

        if (paymentMethodValue === PAYMENT_METHOD_TYPES.CHARGEBEE_BITCOIN) {
            return bitcoinChargebee;
        }

        if (paymentMethodValue === PAYMENT_METHOD_TYPES.CHARGEBEE_SEPA_DIRECT_DEBIT) {
            return directDebit;
        }
    }, [
        paymentMethodValue,
        paymentMethodType,
        card,
        savedMethod,
        paypal,
        paypalCredit,
        savedChargebeeMethod,
        chargebeeCard,
        chargebeePaypal,
    ]);

    const initialized = !methods.loading;

    return {
        methods,
        savedMethod,
        card,
        paypal,
        paypalCredit,
        chargebeeCard,
        chargebeePaypal,
        bitcoinInhouse,
        bitcoinChargebee,
        selectedProcessor,
        flow,
        amount,
        currency,
        paymentContext,
        directDebit,
        initialized,
    };
};
