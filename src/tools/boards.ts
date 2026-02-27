import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { TrelloClient } from '../trello/client.js';
import { 
  validateListBoards, 
  validateGetBoard, 
  validateGetBoardLists, 
  formatValidationError 
} from '../utils/validation.js';

const validateCreateBoard = (args: unknown) => {
  const schema = z.object({
    apiKey: z.string().min(1, 'API key is required'),
    token: z.string().min(1, 'Token is required'),
    name: z.string().min(1, 'Board name is required').max(16384),
    desc: z.string().max(16384).optional(),
    idOrganization: z.string().regex(/^[a-f0-9]{24}$/, 'Invalid organization ID').optional(),
    defaultLabels: z.boolean().optional(),
    defaultLists: z.boolean().optional(),
    prefs_permissionLevel: z.enum(['org', 'private', 'public', 'enterprise']).optional(),
    prefs_background: z.string().optional()
  });
  return schema.parse(args);
};

export const createBoardTool: Tool = {
  name: 'trello_create_board',
  description: 'Create a new Trello board. Optionally set its description, visibility, default lists, and workspace.',
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
      name: {
        type: 'string',
        description: 'Name of the new board'
      },
      desc: {
        type: 'string',
        description: 'Optional description for the board'
      },
      idOrganization: {
        type: 'string',
        description: 'Optional workspace/organization ID to add the board to',
        pattern: '^[a-f0-9]{24}$'
      },
      defaultLabels: {
        type: 'boolean',
        description: 'Whether to create the default labels (red, orange, yellow, green, blue, purple). Defaults to true.',
        default: true
      },
      defaultLists: {
        type: 'boolean',
        description: 'Whether to create the default lists (To Do, Doing, Done). Defaults to true.',
        default: true
      },
      prefs_permissionLevel: {
        type: 'string',
        enum: ['org', 'private', 'public', 'enterprise'],
        description: 'Board visibility: "private" (only members), "org" (workspace members), "public" (anyone)',
        default: 'private'
      },
      prefs_background: {
        type: 'string',
        description: 'Background color or image ID (e.g. "blue", "green", "red", "orange", "purple", "pink", "lime", "sky", "grey")'
      }
    },
    required: ['apiKey', 'token', 'name']
  }
};

export async function handleCreateBoard(args: unknown) {
  try {
    const { apiKey, token, name, desc, idOrganization, defaultLabels, defaultLists, prefs_permissionLevel, prefs_background } = validateCreateBoard(args);
    const client = new TrelloClient({ apiKey, token });

    const response = await client.createBoard({
      name,
      ...(desc !== undefined && { desc }),
      ...(idOrganization !== undefined && { idOrganization }),
      ...(defaultLabels !== undefined && { defaultLabels }),
      ...(defaultLists !== undefined && { defaultLists }),
      ...(prefs_permissionLevel !== undefined && { prefs_permissionLevel }),
      ...(prefs_background !== undefined && { prefs_background })
    });
    const board = response.data;

    const result = {
      summary: `Created board: ${board.name}`,
      board: {
        id: board.id,
        name: board.name,
        description: board.desc || 'No description',
        url: board.shortUrl,
        closed: board.closed,
        permissionLevel: board.prefs?.permissionLevel
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
      content: [{ type: 'text' as const, text: `Error creating board: ${errorMessage}` }],
      isError: true
    };
  }
}

export const listBoardsTool: Tool = {
  name: 'list_boards',
  description: 'List all Trello boards accessible to the user. Use this to see all boards you have access to, or filter by status.',
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
      filter: {
        type: 'string',
        enum: ['all', 'open', 'closed'],
        description: 'Filter boards by status: "open" for active boards, "closed" for archived boards, "all" for both',
        default: 'open'
      }
    },
    required: ['apiKey', 'token']
  }
};

export async function handleListBoards(args: unknown) {
  try {
    const { apiKey, token, filter } = validateListBoards(args);
    const client = new TrelloClient({ apiKey, token });
    
    const response = await client.getMyBoards(filter);
    const boards = response.data;
    
    const summary = `Found ${boards.length} ${filter} board(s)`;
    const boardList = boards.map(board => ({
      id: board.id,
      name: board.name,
      description: board.desc || 'No description',
      url: board.shortUrl,
      lastActivity: board.dateLastActivity,
      closed: board.closed
    }));
    
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify({
            summary,
            boards: boardList,
            rateLimit: response.rateLimit
          }, null, 2)
        }
      ]
    };
  } catch (error) {
    const errorMessage = error instanceof z.ZodError 
      ? formatValidationError(error)
      : error instanceof Error 
        ? error.message 
        : 'Unknown error occurred';
        
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error listing boards: ${errorMessage}`
        }
      ],
      isError: true
    };
  }
}

export const getBoardDetailsTool: Tool = {
  name: 'get_board_details',
  description: 'Get detailed information about a specific Trello board, including its lists and cards. Useful for understanding board structure and content.',
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
      boardId: {
        type: 'string',
        description: 'The ID of the board to retrieve (you can get this from list_boards)',
        pattern: '^[a-f0-9]{24}$'
      },
      includeDetails: {
        type: 'boolean',
        description: 'Include lists and cards in the response for complete board overview',
        default: false
      }
    },
    required: ['apiKey', 'token', 'boardId']
  }
};

export async function handleGetBoardDetails(args: unknown) {
  try {
    const { apiKey, token, boardId, includeDetails } = validateGetBoard(args);
    const client = new TrelloClient({ apiKey, token });
    
    const response = await client.getBoard(boardId, includeDetails);
    const board = response.data;
    
    const result = {
      summary: `Board: ${board.name}`,
      board: {
        id: board.id,
        name: board.name,
        description: board.desc || 'No description',
        url: board.shortUrl,
        lastActivity: board.dateLastActivity,
        closed: board.closed,
        permissions: board.prefs?.permissionLevel || 'unknown',
        ...(includeDetails && {
          lists: board.lists?.map(list => ({
            id: list.id,
            name: list.name,
            position: list.pos,
            closed: list.closed
          })) || [],
          cards: board.cards?.map(card => ({
            id: card.id,
            name: card.name,
            description: card.desc,
            url: card.shortUrl,
            listId: card.idList,
            position: card.pos,
            due: card.due,
            closed: card.closed,
            labels: card.labels?.map(label => ({
              id: label.id,
              name: label.name,
              color: label.color
            })) || []
          })) || []
        })
      },
      rateLimit: response.rateLimit
    };
    
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  } catch (error) {
    const errorMessage = error instanceof z.ZodError 
      ? formatValidationError(error)
      : error instanceof Error 
        ? error.message 
        : 'Unknown error occurred';
        
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error getting board details: ${errorMessage}`
        }
      ],
      isError: true
    };
  }
}

export const getListsTool: Tool = {
  name: 'get_lists',
  description: 'Get all lists in a specific Trello board. Use this to see the workflow columns (like "To Do", "In Progress", "Done") in a board.',
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
      boardId: {
        type: 'string',
        description: 'The ID of the board to get lists from (you can get this from list_boards)',
        pattern: '^[a-f0-9]{24}$'
      },
      filter: {
        type: 'string',
        enum: ['all', 'open', 'closed'],
        description: 'Filter lists by status: "open" for active lists, "closed" for archived lists, "all" for both',
        default: 'open'
      }
    },
    required: ['apiKey', 'token', 'boardId']
  }
};

export async function handleGetLists(args: unknown) {
  try {
    const { apiKey, token, boardId, filter } = validateGetBoardLists(args);
    const client = new TrelloClient({ apiKey, token });
    
    const response = await client.getBoardLists(boardId, filter);
    const lists = response.data;
    
    const result = {
      summary: `Found ${lists.length} ${filter} list(s) in board`,
      boardId,
      lists: lists.map(list => ({
        id: list.id,
        name: list.name,
        position: list.pos,
        closed: list.closed,
        subscribed: list.subscribed
      })),
      rateLimit: response.rateLimit
    };
    
    return {
      content: [
        {
          type: 'text' as const,
          text: JSON.stringify(result, null, 2)
        }
      ]
    };
  } catch (error) {
    const errorMessage = error instanceof z.ZodError 
      ? formatValidationError(error)
      : error instanceof Error 
        ? error.message 
        : 'Unknown error occurred';
        
    return {
      content: [
        {
          type: 'text' as const,
          text: `Error getting lists: ${errorMessage}`
        }
      ],
      isError: true
    };
  }
}