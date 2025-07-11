import type { ReactNode } from 'react';

import { c } from 'ttag';

import { Button } from '@proton/atoms';
import { Alert, type ModalSize, ModalTwoContent, ModalTwoFooter, ModalTwoHeader } from '@proton/components';
import { PassModal } from '@proton/pass/components/Layout/Modal/PassModal';

export type ConfirmationModalProps = {
    onClose?: () => void;
    onSubmit?: () => any | Promise<any>;
    title?: string;
    children?: ReactNode;
    alertText?: ReactNode;
    cancelText?: ReactNode;
    submitText?: ReactNode;
    open?: boolean;
    disabled?: boolean;
    size?: ModalSize;
    closeAfterSubmit?: boolean;
};

export const ConfirmationModal = ({
    alertText,
    cancelText = c('Action').t`Cancel`,
    submitText = c('Action').t`Submit`,
    disabled = false,
    title,
    children,
    open,
    size,
    onClose,
    onSubmit,
    closeAfterSubmit = true,
}: ConfirmationModalProps) => {
    const handleSubmit = async () => {
        await onSubmit?.();
        if (closeAfterSubmit) onClose?.();
    };

    return (
        <PassModal onClose={onClose} onReset={onClose} open={open} size={size ?? 'small'}>
            <ModalTwoHeader title={title} />
            <ModalTwoContent>
                {alertText && (
                    <Alert className="mb-4" type="error">
                        {alertText}
                    </Alert>
                )}

                {children}
            </ModalTwoContent>
            <ModalTwoFooter>
                <Button type="reset" onClick={onClose} pill>
                    {cancelText}
                </Button>
                <Button color="danger" type="button" disabled={disabled} onClick={handleSubmit} pill>
                    {submitText}
                </Button>
            </ModalTwoFooter>
        </PassModal>
    );
};
