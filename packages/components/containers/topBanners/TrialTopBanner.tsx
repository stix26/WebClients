import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';

import { format, fromUnixTime, isBefore } from 'date-fns';
import { c } from 'ttag';

import { useSubscription } from '@proton/account/subscription/hooks';
import { useUser } from '@proton/account/user/hooks';
import { InlineLinkButton } from '@proton/atoms';
import SettingsLink from '@proton/components/components/link/SettingsLink';
import useModalState from '@proton/components/components/modalTwo/useModalState';
import Time from '@proton/components/components/time/Time';
import TimeRemaining from '@proton/components/components/timeRemaining/TimeRemaining';
import SubscriptionModalProvider, {
    useSubscriptionModal,
} from '@proton/components/containers/payments/subscription/SubscriptionModalProvider';
import { SUBSCRIPTION_STEPS } from '@proton/components/containers/payments/subscription/constants';
import useConfig from '@proton/components/hooks/useConfig';
import { CYCLE, PLANS, PLAN_NAMES } from '@proton/payments';
import { getPlanIDs, getPlanTitle, isTrial, isTrialExpired, useIsB2BTrial, willTrialExpire } from '@proton/payments';
import type { APP_NAMES } from '@proton/shared/lib/constants';
import {
    APPS,
    MAIL_APP_NAME,
    OPEN_OFFER_MODAL_EVENT,
    SHARED_UPSELL_PATHS,
    UPSELL_COMPONENT,
} from '@proton/shared/lib/constants';
import { addUpsellPath, getUpgradePath, getUpsellRefFromApp } from '@proton/shared/lib/helpers/upsell';
import { dateLocale } from '@proton/shared/lib/i18n';

import CancelTrialModal from './CancelTrialModal';
import TopBanner from './TopBanner';

const ModalAction = ({ textAction, upsellRef }: { textAction: string; upsellRef: string | undefined }) => {
    const [subscription] = useSubscription();
    const [openSubscriptionModal] = useSubscriptionModal();

    return (
        <InlineLinkButton
            className="color-inherit"
            onClick={() => {
                openSubscriptionModal({
                    step: SUBSCRIPTION_STEPS.CHECKOUT,
                    cycle: CYCLE.YEARLY,
                    planIDs: getPlanIDs(subscription),
                    upsellRef,
                    metrics: {
                        source: 'upsells',
                    },
                });
            }}
        >
            {textAction}
        </InlineLinkButton>
    );
};

const WrappedModalAction = ({
    fromApp,
    ...rest
}: {
    fromApp: APP_NAMES;
    textAction: string;
    upsellRef: string | undefined;
}) => {
    return (
        <SubscriptionModalProvider app={fromApp}>
            <ModalAction {...rest} />
        </SubscriptionModalProvider>
    );
};

const TrialEndsActionButton = ({
    refApp,
    fromApp,
    textAction,
}: {
    refApp?: APP_NAMES;
    fromApp: APP_NAMES;
    textAction: string;
}) => {
    const { APP_NAME } = useConfig();
    const [user] = useUser();
    const [subscription, subscriptionLoading] = useSubscription();
    if (subscriptionLoading) {
        return null;
    }

    const upsellRef = getUpsellRefFromApp({
        app: refApp ?? APP_NAME,
        fromApp,
        component: UPSELL_COMPONENT.BANNER,
        feature: SHARED_UPSELL_PATHS.TRIAL_WILL_END,
    });

    // If that's already Account or VPN settings app then we render the buton that will open the subscription modal
    // directly
    if (APP_NAME === APPS.PROTONACCOUNT || APP_NAME === APPS.PROTONVPN_SETTINGS) {
        return <WrappedModalAction upsellRef={upsellRef} fromApp={fromApp} textAction={textAction} />;
    }

    // For all other apps we render the button that will redirect to the account app
    const upgradePath = addUpsellPath(getUpgradePath({ user, subscription, app: APP_NAME }), upsellRef);
    return (
        <SettingsLink path={upgradePath} className="color-inherit">
            {textAction}
        </SettingsLink>
    );
};

/**
 * Mail and account apps have an upsell modal. It's triggered by the `OPEN_OFFER_MODAL_EVENT` event.
 * The handler component must be rendered in DOM to handle the events.
 */
const UpgradeBannerLink = ({ textAction }: { textAction: string }) => {
    const handleClick = () => document.dispatchEvent(new CustomEvent(OPEN_OFFER_MODAL_EVENT));

    return (
        <InlineLinkButton key="continue" className="color-inherit" onClick={handleClick}>
            {textAction}
        </InlineLinkButton>
    );
};

const TrialEndsActionButtonSwitcher = ({ fromApp }: { fromApp: APP_NAMES }) => {
    const [subscription] = useSubscription();

    if (isTrial(subscription, PLANS.MAIL)) {
        const textAction = c('Button').t`Continue using ${MAIL_APP_NAME}.`;
        return <UpgradeBannerLink textAction={textAction} />;
    }

    if (isTrial(subscription, PLANS.BUNDLE)) {
        const planTitle = PLAN_NAMES[PLANS.BUNDLE];
        const textAction = c('Button').t`Continue using ${planTitle}`;
        return <TrialEndsActionButton fromApp={fromApp} textAction={textAction} />;
    }

    // a catch-all for all other cases
    if (subscription && isTrial(subscription)) {
        const planTitle = getPlanTitle(subscription);
        let textAction = c('Button').t`Continue using ${planTitle}`;
        if (!planTitle) {
            textAction = c('Button').t`Continue your subscription`;
        }

        return <TrialEndsActionButton fromApp={fromApp} textAction={textAction} />;
    }

    return null;
};

const ReferralTopBanner = ({ fromApp }: { fromApp: APP_NAMES }) => {
    const [subscription, loadingSubscription] = useSubscription();
    if (loadingSubscription) {
        return null;
    }

    const action = <TrialEndsActionButtonSwitcher key="trial-action-button" fromApp={fromApp} />;
    const { PeriodEnd = 0 } = subscription || {};
    const textDate = format(fromUnixTime(PeriodEnd), 'PPP', { locale: dateLocale });

    // 1 week before the trial ends
    const willExpire = willTrialExpire(subscription);
    if (willExpire) {
        const message = c('Warning').jt`Your free trial ends on ${textDate}. ${action}`;
        return <TopBanner className="bg-warning">{message}</TopBanner>;
    }

    // Trial has ended
    const isExpired = isTrialExpired(subscription);
    if (isExpired) {
        const message = c('Message')
            .jt`Your free trial has ended. Access to your account will soon be disabled. ${action}`;
        return <TopBanner className="bg-danger">{message}</TopBanner>;
    }

    // In trial
    return null;
};

const B2BTrialTopBanner = () => {
    const [closed, setClosed] = useState<boolean>(false);
    const [modalProps, setModal, renderModal] = useModalState();
    const location = useLocation();
    const [subscription] = useSubscription();

    useEffect(() => {
        const searchParams = new URLSearchParams(location.search);
        if (searchParams.get('open') === 'cancel-trial') {
            setModal(true);
        }
    }, [location.search, setModal]);

    const trialEndsOn = subscription?.PeriodEnd;

    if (!trialEndsOn || closed) {
        return null;
    }

    const trialEnded = isBefore(fromUnixTime(trialEndsOn), new Date());

    if (trialEnded) {
        return null;
    }

    const timeRemaining = <TimeRemaining expiry={trialEndsOn} />;
    const trialEndsOnFormatted = <Time>{trialEndsOn}</Time>;

    return (
        <>
            {renderModal && <CancelTrialModal {...modalProps} />}
            <TopBanner onClose={() => setClosed(true)} className="bg-info">
                <span className="mr-1">{c('Info').jt`Your trial will end in ${timeRemaining}.`}</span>
                <span className="mr-1">{c('Info')
                    .jt`You won't be charged if you cancel before ${trialEndsOnFormatted}.`}</span>
                <InlineLinkButton key="cancel-trial" onClick={() => setModal(true)}>
                    {c('Action').t`Learn more`}
                </InlineLinkButton>
            </TopBanner>
        </>
    );
};

const TrialTopBanner = ({ app }: { app?: APP_NAMES }) => {
    const [subscription] = useSubscription();
    const { APP_NAME } = useConfig();
    const isVpn = APP_NAME === APPS.PROTONVPN_SETTINGS;
    const trial = isTrial(subscription);
    const isB2BTrial = useIsB2BTrial(subscription);

    if (isB2BTrial) {
        return <B2BTrialTopBanner />;
    }

    if (trial && !isVpn && app) {
        return <ReferralTopBanner fromApp={app} />;
    }

    return null;
};

export default TrialTopBanner;
