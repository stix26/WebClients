import { c } from 'ttag';

import type { ModalStateProps } from '@proton/components/components/modalTwo/useModalState';
import type { MAIL_UPSELL_PATHS } from '@proton/shared/lib/constants';
import { APP_UPSELL_REF_PATH, UPSELL_COMPONENT } from '@proton/shared/lib/constants';
import { getUpsellRef } from '@proton/shared/lib/helpers/upsell';
import labelsImg from '@proton/styles/assets/img/illustrations/new-upsells-img/labels.svg';

import UpsellModal from '../UpsellModal/UpsellModal';

interface Props {
    modalProps: ModalStateProps;
    feature:
        | MAIL_UPSELL_PATHS.UNLIMITED_FOLDERS
        | MAIL_UPSELL_PATHS.UNLIMITED_LABELS
        | MAIL_UPSELL_PATHS.UNLIMITED_FOLDERS_NEWSLETTER_SUBSCRIPTION;
    /**
     * Needed in a "Dropdown" scenario because we want to close the dropdown after closing the upsell modal
     */
    onCloseCustomAction?: () => void;
    upsellComponent?: UPSELL_COMPONENT;
    isSettings?: boolean;
}
const LabelsUpsellModal = ({
    modalProps,
    onCloseCustomAction,
    feature,
    upsellComponent,
    isSettings = false,
}: Props) => {
    const upsellRef = getUpsellRef({
        app: APP_UPSELL_REF_PATH.MAIL_UPSELL_REF_PATH,
        component: upsellComponent ?? UPSELL_COMPONENT.MODAL,
        feature,
        isSettings,
    });

    return (
        <UpsellModal
            title={c('Title').t`Need more labels or folders?`}
            description={c('Description').t`Create as many labels or folders as you need to keep your inbox tidy.`}
            modalProps={modalProps}
            illustration={labelsImg}
            upsellRef={upsellRef}
            onClose={onCloseCustomAction}
        />
    );
};

export default LabelsUpsellModal;
