import type { PayloadAction } from '@reduxjs/toolkit';
import type { Draft } from 'immer';

import { safeDecreaseCount, safeIncreaseCount } from '@proton/redux-utilities';
import { isNotExistError } from '@proton/shared/lib/api/helpers/apiErrorHelper';
import type { Message } from '@proton/shared/lib/interfaces/mail/Message';
import { isDraft } from '@proton/shared/lib/mail/messages';
import isTruthy from '@proton/utils/isTruthy';

import { mergeConversations } from '../../helpers/conversation';
import { isConversation, parseLabelIDsInEvent } from '../../helpers/elements';
import { isNetworkError } from '../../helpers/errors';
import type { LabelChanges, UnreadStatus } from '../../helpers/labels';
import { applyLabelChangesOnConversation, applyLabelChangesOnMessage } from '../../helpers/labels';
import { applyMarkAsChangesOnMessage } from '../../helpers/message/messages';
import type { MarkAsChanges } from '../../hooks/optimistic/useOptimisticMarkAs';
import { applyMarkAsChangesOnConversation } from '../../hooks/optimistic/useOptimisticMarkAs';
import type { Conversation } from '../../models/conversation';
import type { Element } from '../../models/element';
import type { EventUpdates, QueryParams, QueryResults, TaskRunningInfo } from '../elements/elementsTypes';
import type { MailState } from '../store';
import { allConversations, conversationByID } from './conversationsSelectors';
import type {
    ConversationErrors,
    ConversationEvent,
    ConversationParams,
    ConversationResult,
    ConversationState,
    ConversationsState,
} from './conversationsTypes';

export const globalReset = (state: Draft<ConversationsState>) => {
    Object.keys(state).forEach((key) => delete state[key]);
};

const getConversation = (state: Draft<ConversationsState>, ID: string) =>
    conversationByID({ conversations: state } as MailState, { ID });

const getAllConversation = (state: Draft<ConversationsState>) =>
    allConversations({ conversations: state } as MailState);

export const initialize = (state: Draft<ConversationsState>, action: PayloadAction<ConversationState>) => {
    state[action.payload.Conversation.ID] = action.payload as any;
};

export const loadFulfilled = (
    state: Draft<ConversationsState>,
    action: PayloadAction<ConversationResult, string, { arg: ConversationParams }>
) => {
    const { Conversation, Messages } = action.payload;
    const { conversationID } = action.meta.arg;

    const conversationState = getConversation(state, conversationID);

    if (conversationState) {
        conversationState.Conversation = Conversation;
        conversationState.Messages = Messages;
        conversationState.loadRetry = conversationState.loadRetry ? conversationState.loadRetry + 1 : 1;
        conversationState.errors = { network: [], unknown: [] };
    } else {
        state[Conversation.ID] = {
            Conversation,
            Messages,
            loadRetry: 1,
            errors: { network: [], unknown: [] },
        };
    }
};

export const loadRejected = (
    state: Draft<ConversationsState>,
    action: PayloadAction<any, string, { arg: ConversationParams }, any | undefined>
) => {
    const { error } = action;

    const errors: ConversationErrors = {};
    if (isNetworkError(error)) {
        errors.network = [error];
    } else if (isNotExistError(error)) {
        errors.notExist = [error];
    } else {
        errors.unknown = [error];
    }

    const { conversationID } = action.meta.arg;

    const conversationState = getConversation(state, conversationID);

    if (conversationState) {
        conversationState.errors = errors;
        conversationState.loadRetry = conversationState.loadRetry ? conversationState.loadRetry + 1 : 1;
    }
};

export const retryLoading = (state: Draft<ConversationsState>, { payload: { ID } }: PayloadAction<{ ID: string }>) => {
    const conversationState = getConversation(state, ID);

    if (conversationState) {
        conversationState.loadRetry = 0;
        conversationState.errors = {};
    }
};

export const applyLabelsOnConversationMessages = (
    state: Draft<ConversationsState>,
    {
        payload: { ID, messageID, changes, unreadStatuses, updatedConversation, conversationResult },
    }: PayloadAction<{
        ID: string;
        messageID: string;
        changes: LabelChanges;
        unreadStatuses: UnreadStatus[] | undefined;
        updatedConversation: Conversation;
        conversationResult: ConversationState;
    }>
) => {
    const conversationState = getConversation(state, ID);

    if (conversationState) {
        conversationState.Conversation = updatedConversation;
        conversationState.Messages = conversationResult.Messages?.map((messageFromConversation: Message) => {
            if (messageFromConversation.ID === messageID) {
                return applyLabelChangesOnMessage(messageFromConversation, changes, unreadStatuses);
            }
            return messageFromConversation;
        });
    }
};

export const applyLabelsOnConversation = (
    state: Draft<ConversationsState>,
    {
        payload: { ID, changes, unreadStatuses },
    }: PayloadAction<{ ID: string; changes: LabelChanges; unreadStatuses: UnreadStatus[] | undefined }>
) => {
    const conversationState = getConversation(state, ID);

    if (conversationState) {
        conversationState.Conversation = applyLabelChangesOnConversation(
            conversationState.Conversation,
            changes,
            unreadStatuses
        );
    }
};

export const optimisticDelete = (state: Draft<ConversationsState>, { payload: ID }: PayloadAction<string>) => {
    delete state[ID];
};

export const optimisticDeleteConversationMessages = (
    state: Draft<ConversationsState>,
    { payload: { ID, messages } }: PayloadAction<{ ID: string; messages: Message[] }>
) => {
    const conversationState = getConversation(state, ID);

    if (conversationState) {
        conversationState.Messages = messages;
    }
};

export const optimisticRestore = (
    state: Draft<ConversationsState>,
    { payload: conversations }: PayloadAction<ConversationState[]>
) => {
    conversations.forEach((conversation) => {
        state[conversation.Conversation.ID] = conversation;
    });
};

export const optimisticMarkAsConversationMessages = (
    state: Draft<ConversationsState>,
    {
        payload: { ID, messageID, updatedConversation, changes },
    }: PayloadAction<{ ID: string; messageID: string; updatedConversation: Conversation; changes: MarkAsChanges }>
) => {
    const conversationState = getConversation(state, ID);

    if (conversationState) {
        conversationState.Conversation = updatedConversation;
        conversationState.Messages = conversationState.Messages?.map((conversationMessage) => {
            if (conversationMessage.ID === messageID) {
                return applyMarkAsChangesOnMessage(conversationMessage, changes);
            }
            return conversationMessage;
        });
    }
};

export const optimisticMarkAsConversation = (
    state: Draft<ConversationsState>,
    { payload: { ID, labelID, changes } }: PayloadAction<{ ID: string; labelID: string; changes: MarkAsChanges }>
) => {
    const conversationState = getConversation(state, ID);

    if (conversationState) {
        conversationState.Conversation = applyMarkAsChangesOnConversation(
            conversationState.Conversation,
            labelID,
            changes
        );
    }
};

export const deleteConversation = (state: Draft<ConversationsState>, { payload: ID }: PayloadAction<string>) => {
    delete state[ID];
};

export const updateConversation = (
    state: Draft<ConversationsState>,
    { payload: { ID, updates } }: PayloadAction<{ ID: string; updates: Partial<ConversationState> }>
) => {
    const currentConversation = getConversation(state, ID);
    const updatedConversation = mergeConversations(currentConversation, updates);

    state[ID] = updatedConversation;
};

export const eventMessagesUpdates = (state: Draft<ConversationsState>, action: PayloadAction<ConversationEvent>) => {
    const { toCreate, toUpdate, toDelete } = action.payload;

    if (toCreate.length === 0 && toUpdate.length === 0 && Object.keys(toDelete).length === 0) {
        return;
    }

    // Create and update conversation messages
    [...toCreate, ...toUpdate].forEach((messageEvent) => {
        const conversationState = getConversation(state, messageEvent.ConversationID);
        if (conversationState) {
            conversationState.loadRetry = 0;
            conversationState.errors = {};

            const isUpdate = conversationState.Messages?.some((message: Message) => message.ID === messageEvent.ID);

            let updatedMessages: Message[];

            if (isUpdate && conversationState.Messages) {
                updatedMessages = conversationState.Messages.map((message: Message) => {
                    if (message.ID === messageEvent.ID) {
                        return parseLabelIDsInEvent(message, messageEvent);
                    }
                    return message;
                });
            } else {
                updatedMessages = [...(conversationState.Messages || []), messageEvent];
            }

            conversationState.Messages = updatedMessages;
        }
    });

    // Delete conversation messages
    if (Object.keys(toDelete).length > 0) {
        const allConversations = getAllConversation(state);
        allConversations.forEach((conversationState) => {
            if (conversationState?.Conversation.ID && conversationState.Messages) {
                const updatedMessages = conversationState.Messages.filter(({ ID }) => !toDelete[ID]);

                if (conversationState.Messages.length !== updatedMessages.length) {
                    conversationState.Messages = updatedMessages;
                }
            }
        });
    }
};

export const eventConversationUpdate = (
    state: Draft<ConversationsState>,
    { payload: { ID, updatedConversation } }: PayloadAction<{ ID: string; updatedConversation: Conversation }>
) => {
    const conversationState = getConversation(state, ID);

    if (conversationState) {
        conversationState.Conversation = updatedConversation;
    }
};

// Update conversations from fetch elements
export const updateFromElements = (
    state: Draft<ConversationsState>,
    action: PayloadAction<
        {
            result: QueryResults;
            taskRunning: TaskRunningInfo;
        },
        string,
        {
            arg: QueryParams;
            requestId: string;
            requestStatus: 'fulfilled';
        },
        never
    >
) => {
    const { Elements } = action.payload.result;

    if (Elements && Elements.length) {
        Elements.forEach((element) => {
            if (isConversation(element)) {
                const conversationState = getConversation(state, element.ID);

                if (conversationState) {
                    conversationState.Conversation = { ...conversationState.Conversation, ...element };
                }
            }
        });
    }
};

// Update conversations from individual element load
export const updateFromLoadElements = (
    state: Draft<ConversationsState>,
    action: PayloadAction<(Element | undefined)[], string, { arg: EventUpdates }>
) => {
    action.payload.filter(isTruthy).forEach((element) => {
        if (isConversation(element)) {
            const conversationState = getConversation(state, element.ID);

            if (conversationState) {
                conversationState.Conversation = element;
            }
        }
    });
};

export const updateMessageOnSend = (state: Draft<ConversationsState>, { payload: Sent }: PayloadAction<Message>) => {
    const conversationState = getConversation(state, Sent.ConversationID);

    if (conversationState?.Messages?.length) {
        const messageIndex = conversationState.Messages.findIndex((message) => message.ID === Sent.ID);
        if (messageIndex !== -1) {
            conversationState.Messages[messageIndex] = Sent;
        }
    }
};

export const markMessagesAsReadPending = (
    state: Draft<ConversationsState>,
    action: PayloadAction<
        undefined,
        string,
        { arg: { elements: Element[]; isEncryptedSearch: boolean; labelID: string; showSuccessNotification?: boolean } }
    >
) => {
    const { elements } = action.meta.arg;

    elements.forEach((selectedElement) => {
        const selectedMessage = selectedElement as Message;

        if (selectedMessage.Unread === 0) {
            return;
        }

        const conversationState = getConversation(state, selectedMessage.ConversationID);

        if (conversationState) {
            conversationState.Conversation.ContextNumUnread = safeDecreaseCount(
                conversationState.Conversation.ContextNumUnread,
                1
            );

            conversationState.Conversation.NumUnread = safeDecreaseCount(conversationState.Conversation.NumUnread, 1);

            selectedMessage.LabelIDs.forEach((messageLabelID) => {
                const conversationLabel = conversationState.Conversation.Labels?.find(
                    (label) => label.ID === messageLabelID
                );

                if (conversationLabel) {
                    conversationLabel.ContextNumUnread = safeDecreaseCount(conversationLabel.ContextNumUnread, 1);
                }
            });

            const messageState = conversationState.Messages?.find((message) => message.ID === selectedMessage.ID);

            if (messageState) {
                messageState.Unread = 0;
            }
        }
    });
};

export const markMessagesAsUnreadPending = (
    state: Draft<ConversationsState>,
    action: PayloadAction<undefined, string, { arg: { elements: Element[]; labelID: string } }>
) => {
    const { elements } = action.meta.arg;

    elements.forEach((selectedElement) => {
        const selectedMessage = selectedElement as Message;

        if (selectedMessage.Unread === 1) {
            return;
        }

        const conversationState = getConversation(state, selectedMessage.ConversationID);

        if (conversationState) {
            conversationState.Conversation.ContextNumUnread = safeIncreaseCount(
                conversationState.Conversation.ContextNumUnread,
                1
            );
            conversationState.Conversation.NumUnread = safeIncreaseCount(conversationState.Conversation.NumUnread, 1);

            selectedMessage.LabelIDs.forEach((messageLabelID) => {
                const conversationLabel = conversationState.Conversation.Labels?.find(
                    (label) => label.ID === messageLabelID
                );

                if (conversationLabel) {
                    conversationLabel.ContextNumUnread = safeIncreaseCount(conversationLabel.ContextNumUnread, 1);
                }
            });

            const messageState = conversationState.Messages?.find((message) => message.ID === selectedMessage.ID);

            if (messageState) {
                messageState.Unread = 1;
            }
        }
    });
};

export const markConversationsAsReadPending = (
    state: Draft<ConversationsState>,
    action: PayloadAction<undefined, string, { arg: { elements: Element[]; labelID: string } }>
) => {
    const { elements, labelID } = action.meta.arg;

    elements.forEach((selectedElement) => {
        const selectedConversation = selectedElement as Conversation;
        const conversationLabel = selectedConversation?.Labels?.find((label) => label.ID === labelID);

        if (conversationLabel?.ContextNumUnread === 0) {
            return;
        }

        const conversationState = getConversation(state, selectedConversation.ID);

        if (conversationState) {
            conversationState.Conversation.ContextNumUnread = 0;
            conversationState.Conversation.NumUnread = 0;
            conversationState.Conversation.Labels?.forEach((label) => {
                label.ContextNumUnread = 0;
            });
            conversationState.Messages?.forEach((message) => {
                message.Unread = 0;
            });
        }
    });
};

export const markConversationsAsUnreadPending = (
    state: Draft<ConversationsState>,
    action: PayloadAction<undefined, string, { arg: { elements: Element[]; labelID: string } }>
) => {
    const { elements, labelID } = action.meta.arg;

    elements.forEach((selectedElement) => {
        const selectedConversation = selectedElement as Conversation;
        const conversationLabel = selectedConversation?.Labels?.find((label) => label.ID === labelID);

        if (!!conversationLabel?.ContextNumUnread) {
            // Conversation is already unread, do nothing
            return;
        }

        const conversationState = getConversation(state, selectedConversation.ID);

        if (conversationState) {
            conversationState.Conversation.ContextNumUnread = safeIncreaseCount(
                conversationState.Conversation.ContextNumUnread,
                1
            );
            conversationState.Conversation.NumUnread = safeIncreaseCount(conversationState.Conversation.NumUnread, 1);
            conversationState.Conversation.Labels?.forEach((label) => {
                if (label.ID === labelID) {
                    label.ContextNumUnread = safeIncreaseCount(label.ContextNumUnread, 1);
                }
            });

            const latestMessage = conversationState.Messages?.filter(
                (message) => message.LabelIDs.includes(labelID) && !isDraft(message)
            ).sort((a, b) => (b?.Order || 0) - (a?.Order || 0))[0];

            if (latestMessage) {
                latestMessage.Unread = 1;
            }
        }
    });
};
