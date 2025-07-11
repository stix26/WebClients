import type { ChangeEvent } from 'react';
import { useEffect, useRef, useState } from 'react';

import { c } from 'ttag';

import { Button, Input } from '@proton/atoms';
import Editor from '@proton/components/components/editor/Editor';
import { useToolbar } from '@proton/components/components/editor/hooks/useToolbar';
import type { EditorActions } from '@proton/components/components/editor/interface';
import Info from '@proton/components/components/link/Info';
import useActiveBreakpoint from '@proton/components/hooks/useActiveBreakpoint';
import useApi from '@proton/components/hooks/useApi';
import useEventManager from '@proton/components/hooks/useEventManager';
import useNotifications from '@proton/components/hooks/useNotifications';
import { useLoading } from '@proton/hooks';
import { useMailSettings } from '@proton/mail/store/mailSettings/hooks';
import { updateAddress } from '@proton/shared/lib/api/addresses';
import { getKnowledgeBaseUrl } from '@proton/shared/lib/helpers/url';
import type { Address } from '@proton/shared/lib/interfaces';
import { DEFAULT_MAILSETTINGS } from '@proton/shared/lib/mail/mailSettings';

import { useHotkeys } from '../../hooks/useHotkeys';
import SettingsLayout from '../account/SettingsLayout';
import SettingsLayoutLeft from '../account/SettingsLayoutLeft';
import SettingsLayoutRight from '../account/SettingsLayoutRight';

const EMPTY_VALUES = [/^(<div><br><\/div>)+$/, /^(<div>\s*<\/div>)+$/];

const formatSignature = (value: string) => (EMPTY_VALUES.some((regex) => regex.test(value)) ? '' : value);

interface Props {
    address: Address;
}

const EditAddressesSection = ({ address }: Props) => {
    const [mailSettings = DEFAULT_MAILSETTINGS] = useMailSettings();
    const api = useApi();
    const { call } = useEventManager();
    const [loading, withLoading] = useLoading();
    const [editorReady, setEditorReady] = useState(false);
    const [displayName, setDisplayName] = useState(address.DisplayName);
    const [signatureUpdated, setSignatureUpdated] = useState(false);
    const { createNotification } = useNotifications();
    const { viewportWidth } = useActiveBreakpoint();

    const editorWrapperRef = useRef<HTMLDivElement>(null);
    const editorRef = useRef<EditorActions>();

    const handleReady = (actions: EditorActions) => {
        actions.setContent(address.Signature);
        editorRef.current = actions;
        setEditorReady(true);
    };

    const handleDisplayName = ({ target }: ChangeEvent<HTMLInputElement>) => {
        setDisplayName(target.value);
    };

    const handleSubmit = async () => {
        const signature = signatureUpdated ? (editorRef.current?.getContent() as string) : address.Signature;

        await api(
            updateAddress(address.ID, {
                DisplayName: displayName,
                Signature: formatSignature(signature),
            })
        );
        await call();
        createNotification({ text: c('Success').t`Address updated` });
    };

    useHotkeys(editorWrapperRef, [
        [
            ['Meta', 'Enter'],
            () => {
                if (mailSettings.Shortcuts) {
                    void withLoading(handleSubmit());
                }
            },
        ],
    ]);

    // On address change
    useEffect(() => {
        setDisplayName(address.DisplayName);
        setTimeout(() => {
            if (editorRef?.current && editorReady) {
                setSignatureUpdated(false);
                editorRef.current.setContent(address.Signature);
            }
        }, 100);
    }, [address]);

    const { openEmojiPickerRef, toolbarConfig, setToolbarConfig, modalLink, modalImage, modalDefaultFont } = useToolbar(
        {}
    );

    return (
        <form
            onSubmit={async (e) => {
                e.preventDefault();
                await withLoading(handleSubmit());
            }}
        >
            <SettingsLayout>
                <SettingsLayoutLeft>
                    <label htmlFor="displayName" className="text-semibold">
                        {c('Label').t`Display name`}
                    </label>
                </SettingsLayoutLeft>
                <SettingsLayoutRight>
                    <Input
                        id="displayName"
                        value={displayName}
                        placeholder={c('Placeholder').t`Choose display name`}
                        onChange={handleDisplayName}
                        data-testid="settings:identity-section:display-name"
                    />
                </SettingsLayoutRight>
            </SettingsLayout>

            <SettingsLayout stackEarlier className="max-w-custom" style={{ '--max-w-custom': '49em' }}>
                <SettingsLayoutLeft>
                    {/* eslint-disable-next-line */}
                    <label
                        htmlFor="rooster-editor"
                        className="text-semibold"
                        onClick={() => editorRef.current?.focus()}
                    >
                        <span className="mr-2">{c('Label').t`Signature`}</span>
                        <Info
                            url={getKnowledgeBaseUrl('/display-name-email-signature')}
                            title={c('Tooltip').t`Click here to learn how to create a customized signature with HTML.`}
                        />
                    </label>
                </SettingsLayoutLeft>
                <SettingsLayoutRight>
                    <div ref={editorWrapperRef} tabIndex={-1}>
                        <Editor
                            onReady={handleReady}
                            onChange={() => {
                                setSignatureUpdated(true);
                            }}
                            simple
                            openEmojiPickerRef={openEmojiPickerRef}
                            toolbarConfig={toolbarConfig}
                            setToolbarConfig={setToolbarConfig}
                            modalLink={modalLink}
                            modalImage={modalImage}
                            modalDefaultFont={modalDefaultFont}
                            isSmallViewportForToolbar={viewportWidth['<=medium']}
                            mailSettings={mailSettings}
                            title={c('Label').t`Signature`}
                        />
                    </div>

                    <Button
                        color="norm"
                        type="submit"
                        disabled={loading}
                        loading={loading}
                        className="mt-4"
                        data-testid="settings:identity-section:update"
                    >
                        {c('Action').t`Update`}
                    </Button>
                </SettingsLayoutRight>
            </SettingsLayout>
        </form>
    );
};

export default EditAddressesSection;
