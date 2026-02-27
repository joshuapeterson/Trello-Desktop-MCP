import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { TrelloClient } from '../trello/client.js';
import { formatValidationError } from '../utils/validation.js';

const trelloId = z.string().regex(/^[a-f0-9]{24}$/, 'Invalid Trello ID format');

const validateCreateChecklist = (args: unknown) => {
  const schema = z.object({
    apiKey: z.string().min(1, 'API key is required'),
    token: z.string().min(1, 'Token is required'),
    idCard: trelloId,
    name: z.string().min(1).max(16384).optional(),
    pos: z.union([z.number().min(0), z.enum(['top', 'bottom'])]).optional(),
    idChecklistSource: trelloId.optional()
  });
  return schema.parse(args);
};

const validateGetChecklist = (args: unknown) => {
  const schema = z.object({
    apiKey: z.string().min(1, 'API key is required'),
    token: z.string().min(1, 'Token is required'),
    checklistId: trelloId
  });
  return schema.parse(args);
};

const validateUpdateChecklist = (args: unknown) => {
  const schema = z.object({
    apiKey: z.string().min(1, 'API key is required'),
    token: z.string().min(1, 'Token is required'),
    checklistId: trelloId,
    name: z.string().min(1).max(16384).optional(),
    pos: z.union([z.number().min(0), z.enum(['top', 'bottom'])]).optional()
  });
  return schema.parse(args);
};

const validateDeleteChecklist = (args: unknown) => {
  const schema = z.object({
    apiKey: z.string().min(1, 'API key is required'),
    token: z.string().min(1, 'Token is required'),
    checklistId: trelloId
  });
  return schema.parse(args);
};

const validateCreateChecklistItem = (args: unknown) => {
  const schema = z.object({
    apiKey: z.string().min(1, 'API key is required'),
    token: z.string().min(1, 'Token is required'),
    checklistId: trelloId,
    name: z.string().min(1, 'Item name is required').max(16384),
    pos: z.union([z.number().min(0), z.enum(['top', 'bottom'])]).optional(),
    checked: z.boolean().optional(),
    due: z.string().datetime().optional(),
    idMember: trelloId.optional()
  });
  return schema.parse(args);
};

const validateUpdateChecklistItem = (args: unknown) => {
  const schema = z.object({
    apiKey: z.string().min(1, 'API key is required'),
    token: z.string().min(1, 'Token is required'),
    cardId: trelloId,
    checkItemId: trelloId,
    state: z.enum(['complete', 'incomplete']).optional(),
    name: z.string().min(1).max(16384).optional(),
    pos: z.union([z.number().min(0), z.enum(['top', 'bottom'])]).optional(),
    due: z.string().datetime().nullable().optional(),
    idMember: trelloId.nullable().optional(),
    idChecklist: trelloId.optional()
  });
  return schema.parse(args);
};

const validateDeleteChecklistItem = (args: unknown) => {
  const schema = z.object({
    apiKey: z.string().min(1, 'API key is required'),
    token: z.string().min(1, 'Token is required'),
    checklistId: trelloId,
    checkItemId: trelloId
  });
  return schema.parse(args);
};

// ── Create Checklist ──────────────────────────────────────────────────────────

export const trelloCreateChecklistTool: Tool = {
  name: 'trello_create_checklist',
  description: 'Create a new checklist on a Trello card. Optionally copy items from an existing checklist.',
  inputSchema: {
    type: 'object',
    properties: {
      apiKey: {
        type: 'string',
        description: 'Trello API key (automatically provided by Claude.app from your stored credentials)'
      },
      token: {
        type: 'string',
        description: 'Trello API token (automatically provided by Claude.app from your stored credentials)'
      },
      idCard: {
        type: 'string',
        description: 'ID of the card to add the checklist to',
        pattern: '^[a-f0-9]{24}$'
      },
      name: {
        type: 'string',
        description: 'Name of the checklist (defaults to "Checklist" if omitted)'
      },
      pos: {
        oneOf: [
          { type: 'number', minimum: 0 },
          { type: 'string', enum: ['top', 'bottom'] }
        ],
        description: 'Position of the checklist on the card: "top", "bottom", or a positive number'
      },
      idChecklistSource: {
        type: 'string',
        description: 'ID of an existing checklist to copy items from',
        pattern: '^[a-f0-9]{24}$'
      }
    },
    required: ['apiKey', 'token', 'idCard']
  }
};

export async function handleTrelloCreateChecklist(args: unknown) {
  try {
    const { apiKey, token, idCard, name, pos, idChecklistSource } = validateCreateChecklist(args);
    const client = new TrelloClient({ apiKey, token });

    const response = await client.createChecklist({
      idCard,
      ...(name !== undefined && { name }),
      ...(pos !== undefined && { pos }),
      ...(idChecklistSource !== undefined && { idChecklistSource })
    });
    const checklist = response.data;

    const result = {
      summary: `Created checklist "${checklist.name}" on card`,
      checklist: {
        id: checklist.id,
        name: checklist.name,
        position: checklist.pos,
        cardId: checklist.idCard,
        boardId: checklist.idBoard,
        checkItems: checklist.checkItems ?? []
      },
      rateLimit: response.rateLimit
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }]
    };
  } catch (error) {
    const errorMessage = error instanceof z.ZodError
      ? formatValidationError(error)
      : error instanceof Error
        ? error.message
        : 'Unknown error occurred';

    return {
      content: [{ type: 'text' as const, text: `Error creating checklist: ${errorMessage}` }],
      isError: true
    };
  }
}

// ── Get Checklist ─────────────────────────────────────────────────────────────

export const trelloGetChecklistTool: Tool = {
  name: 'trello_get_checklist',
  description: 'Get a specific Trello checklist by ID, including all of its check items.',
  inputSchema: {
    type: 'object',
    properties: {
      apiKey: {
        type: 'string',
        description: 'Trello API key (automatically provided by Claude.app from your stored credentials)'
      },
      token: {
        type: 'string',
        description: 'Trello API token (automatically provided by Claude.app from your stored credentials)'
      },
      checklistId: {
        type: 'string',
        description: 'ID of the checklist to retrieve',
        pattern: '^[a-f0-9]{24}$'
      }
    },
    required: ['apiKey', 'token', 'checklistId']
  }
};

export async function handleTrelloGetChecklist(args: unknown) {
  try {
    const { apiKey, token, checklistId } = validateGetChecklist(args);
    const client = new TrelloClient({ apiKey, token });

    const response = await client.getChecklist(checklistId);
    const checklist = response.data;

    const result = {
      summary: `Checklist: ${checklist.name}`,
      checklist: {
        id: checklist.id,
        name: checklist.name,
        position: checklist.pos,
        cardId: checklist.idCard,
        boardId: checklist.idBoard,
        checkItems: checklist.checkItems?.map((item: any) => ({
          id: item.id,
          name: item.name,
          state: item.state,
          position: item.pos,
          due: item.due,
          idMember: item.idMember
        })) ?? []
      },
      rateLimit: response.rateLimit
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }]
    };
  } catch (error) {
    const errorMessage = error instanceof z.ZodError
      ? formatValidationError(error)
      : error instanceof Error
        ? error.message
        : 'Unknown error occurred';

    return {
      content: [{ type: 'text' as const, text: `Error getting checklist: ${errorMessage}` }],
      isError: true
    };
  }
}

// ── Update Checklist ──────────────────────────────────────────────────────────

export const trelloUpdateChecklistTool: Tool = {
  name: 'trello_update_checklist',
  description: 'Update the name or position of a Trello checklist.',
  inputSchema: {
    type: 'object',
    properties: {
      apiKey: {
        type: 'string',
        description: 'Trello API key (automatically provided by Claude.app from your stored credentials)'
      },
      token: {
        type: 'string',
        description: 'Trello API token (automatically provided by Claude.app from your stored credentials)'
      },
      checklistId: {
        type: 'string',
        description: 'ID of the checklist to update',
        pattern: '^[a-f0-9]{24}$'
      },
      name: {
        type: 'string',
        description: 'New name for the checklist'
      },
      pos: {
        oneOf: [
          { type: 'number', minimum: 0 },
          { type: 'string', enum: ['top', 'bottom'] }
        ],
        description: 'New position: "top", "bottom", or a positive number'
      }
    },
    required: ['apiKey', 'token', 'checklistId']
  }
};

export async function handleTrelloUpdateChecklist(args: unknown) {
  try {
    const { apiKey, token, checklistId, name, pos } = validateUpdateChecklist(args);
    const client = new TrelloClient({ apiKey, token });

    const response = await client.updateChecklist(checklistId, {
      ...(name !== undefined && { name }),
      ...(pos !== undefined && { pos })
    });
    const checklist = response.data;

    const result = {
      summary: `Updated checklist "${checklist.name}"`,
      checklist: {
        id: checklist.id,
        name: checklist.name,
        position: checklist.pos,
        cardId: checklist.idCard,
        boardId: checklist.idBoard
      },
      rateLimit: response.rateLimit
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }]
    };
  } catch (error) {
    const errorMessage = error instanceof z.ZodError
      ? formatValidationError(error)
      : error instanceof Error
        ? error.message
        : 'Unknown error occurred';

    return {
      content: [{ type: 'text' as const, text: `Error updating checklist: ${errorMessage}` }],
      isError: true
    };
  }
}

// ── Delete Checklist ──────────────────────────────────────────────────────────

export const trelloDeleteChecklistTool: Tool = {
  name: 'trello_delete_checklist',
  description: 'Permanently delete a checklist from a Trello card. This also removes all its check items.',
  inputSchema: {
    type: 'object',
    properties: {
      apiKey: {
        type: 'string',
        description: 'Trello API key (automatically provided by Claude.app from your stored credentials)'
      },
      token: {
        type: 'string',
        description: 'Trello API token (automatically provided by Claude.app from your stored credentials)'
      },
      checklistId: {
        type: 'string',
        description: 'ID of the checklist to delete',
        pattern: '^[a-f0-9]{24}$'
      }
    },
    required: ['apiKey', 'token', 'checklistId']
  }
};

export async function handleTrelloDeleteChecklist(args: unknown) {
  try {
    const { apiKey, token, checklistId } = validateDeleteChecklist(args);
    const client = new TrelloClient({ apiKey, token });

    await client.deleteChecklist(checklistId);

    const result = {
      summary: `Deleted checklist ${checklistId}`,
      checklistId,
      deleted: true
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }]
    };
  } catch (error) {
    const errorMessage = error instanceof z.ZodError
      ? formatValidationError(error)
      : error instanceof Error
        ? error.message
        : 'Unknown error occurred';

    return {
      content: [{ type: 'text' as const, text: `Error deleting checklist: ${errorMessage}` }],
      isError: true
    };
  }
}

// ── Create Check Item ─────────────────────────────────────────────────────────

export const trelloCreateChecklistItemTool: Tool = {
  name: 'trello_create_checklist_item',
  description: 'Add a new check item to an existing Trello checklist.',
  inputSchema: {
    type: 'object',
    properties: {
      apiKey: {
        type: 'string',
        description: 'Trello API key (automatically provided by Claude.app from your stored credentials)'
      },
      token: {
        type: 'string',
        description: 'Trello API token (automatically provided by Claude.app from your stored credentials)'
      },
      checklistId: {
        type: 'string',
        description: 'ID of the checklist to add the item to',
        pattern: '^[a-f0-9]{24}$'
      },
      name: {
        type: 'string',
        description: 'Text/name of the check item'
      },
      pos: {
        oneOf: [
          { type: 'number', minimum: 0 },
          { type: 'string', enum: ['top', 'bottom'] }
        ],
        description: 'Position in the checklist: "top", "bottom", or a positive number'
      },
      checked: {
        type: 'boolean',
        description: 'Whether the item starts as checked (complete)',
        default: false
      },
      due: {
        type: 'string',
        format: 'date-time',
        description: 'Optional due date for the check item (ISO 8601 format)'
      },
      idMember: {
        type: 'string',
        description: 'Optional member ID to assign to this check item',
        pattern: '^[a-f0-9]{24}$'
      }
    },
    required: ['apiKey', 'token', 'checklistId', 'name']
  }
};

export async function handleTrelloCreateChecklistItem(args: unknown) {
  try {
    const { apiKey, token, checklistId, name, pos, checked, due, idMember } = validateCreateChecklistItem(args);
    const client = new TrelloClient({ apiKey, token });

    const response = await client.createChecklistItem(checklistId, {
      name,
      ...(pos !== undefined && { pos }),
      ...(checked !== undefined && { checked }),
      ...(due !== undefined && { due }),
      ...(idMember !== undefined && { idMember })
    });
    const item = response.data;

    const result = {
      summary: `Created check item "${item.name}"`,
      checkItem: {
        id: item.id,
        name: item.name,
        state: item.state,
        position: item.pos,
        due: item.due,
        idMember: item.idMember,
        checklistId: item.idChecklist
      },
      rateLimit: response.rateLimit
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }]
    };
  } catch (error) {
    const errorMessage = error instanceof z.ZodError
      ? formatValidationError(error)
      : error instanceof Error
        ? error.message
        : 'Unknown error occurred';

    return {
      content: [{ type: 'text' as const, text: `Error creating check item: ${errorMessage}` }],
      isError: true
    };
  }
}

// ── Update Check Item ─────────────────────────────────────────────────────────

export const trelloUpdateChecklistItemTool: Tool = {
  name: 'trello_update_checklist_item',
  description: 'Update a check item on a Trello card. Use this to mark items complete/incomplete, rename them, change their position, or move them to a different checklist.',
  inputSchema: {
    type: 'object',
    properties: {
      apiKey: {
        type: 'string',
        description: 'Trello API key (automatically provided by Claude.app from your stored credentials)'
      },
      token: {
        type: 'string',
        description: 'Trello API token (automatically provided by Claude.app from your stored credentials)'
      },
      cardId: {
        type: 'string',
        description: 'ID of the card that owns the check item',
        pattern: '^[a-f0-9]{24}$'
      },
      checkItemId: {
        type: 'string',
        description: 'ID of the check item to update',
        pattern: '^[a-f0-9]{24}$'
      },
      state: {
        type: 'string',
        enum: ['complete', 'incomplete'],
        description: 'Mark the item as "complete" or "incomplete"'
      },
      name: {
        type: 'string',
        description: 'New text/name for the check item'
      },
      pos: {
        oneOf: [
          { type: 'number', minimum: 0 },
          { type: 'string', enum: ['top', 'bottom'] }
        ],
        description: 'New position: "top", "bottom", or a positive number'
      },
      due: {
        type: ['string', 'null'],
        format: 'date-time',
        description: 'Set a due date (ISO 8601) or null to remove it'
      },
      idMember: {
        type: ['string', 'null'],
        description: 'Assign a member by ID, or null to remove the assignment',
        pattern: '^[a-f0-9]{24}$'
      },
      idChecklist: {
        type: 'string',
        description: 'Move the check item to a different checklist by providing the target checklist ID',
        pattern: '^[a-f0-9]{24}$'
      }
    },
    required: ['apiKey', 'token', 'cardId', 'checkItemId']
  }
};

export async function handleTrelloUpdateChecklistItem(args: unknown) {
  try {
    const { apiKey, token, cardId, checkItemId, state, name, pos, due, idMember, idChecklist } = validateUpdateChecklistItem(args);
    const client = new TrelloClient({ apiKey, token });

    const response = await client.updateChecklistItem(cardId, checkItemId, {
      ...(state !== undefined && { state }),
      ...(name !== undefined && { name }),
      ...(pos !== undefined && { pos }),
      ...(due !== undefined && { due }),
      ...(idMember !== undefined && { idMember }),
      ...(idChecklist !== undefined && { idChecklist })
    });
    const item = response.data;

    const result = {
      summary: `Updated check item "${item.name}"`,
      checkItem: {
        id: item.id,
        name: item.name,
        state: item.state,
        position: item.pos,
        due: item.due,
        idMember: item.idMember,
        checklistId: item.idChecklist,
        cardId: item.idCard
      },
      rateLimit: response.rateLimit
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }]
    };
  } catch (error) {
    const errorMessage = error instanceof z.ZodError
      ? formatValidationError(error)
      : error instanceof Error
        ? error.message
        : 'Unknown error occurred';

    return {
      content: [{ type: 'text' as const, text: `Error updating check item: ${errorMessage}` }],
      isError: true
    };
  }
}

// ── Delete Check Item ─────────────────────────────────────────────────────────

export const trelloDeleteChecklistItemTool: Tool = {
  name: 'trello_delete_checklist_item',
  description: 'Permanently delete a check item from a Trello checklist.',
  inputSchema: {
    type: 'object',
    properties: {
      apiKey: {
        type: 'string',
        description: 'Trello API key (automatically provided by Claude.app from your stored credentials)'
      },
      token: {
        type: 'string',
        description: 'Trello API token (automatically provided by Claude.app from your stored credentials)'
      },
      checklistId: {
        type: 'string',
        description: 'ID of the checklist that contains the item',
        pattern: '^[a-f0-9]{24}$'
      },
      checkItemId: {
        type: 'string',
        description: 'ID of the check item to delete',
        pattern: '^[a-f0-9]{24}$'
      }
    },
    required: ['apiKey', 'token', 'checklistId', 'checkItemId']
  }
};

export async function handleTrelloDeleteChecklistItem(args: unknown) {
  try {
    const { apiKey, token, checklistId, checkItemId } = validateDeleteChecklistItem(args);
    const client = new TrelloClient({ apiKey, token });

    await client.deleteChecklistItem(checklistId, checkItemId);

    const result = {
      summary: `Deleted check item ${checkItemId} from checklist ${checklistId}`,
      checklistId,
      checkItemId,
      deleted: true
    };

    return {
      content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }]
    };
  } catch (error) {
    const errorMessage = error instanceof z.ZodError
      ? formatValidationError(error)
      : error instanceof Error
        ? error.message
        : 'Unknown error occurred';

    return {
      content: [{ type: 'text' as const, text: `Error deleting check item: ${errorMessage}` }],
      isError: true
    };
  }
}
