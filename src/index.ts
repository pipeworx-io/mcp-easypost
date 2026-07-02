interface McpToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

interface McpToolExport {
  tools: McpToolDefinition[];
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  meter?: { credits: number };
  cost?: Record<string, unknown>;
  provider?: string;
}

/**
 * EasyPost MCP — multi-carrier shipping rates + package tracking (easypost.com)
 *
 * Tools:
 * - easypost_rates: get shipping rate quotes across carriers for a parcel.
 * - easypost_track: track a package by tracking number.
 *
 * Auth: EasyPost HTTP Basic — the API key is the USERNAME with an empty
 * password. Header = `Basic ${btoa(apiKey + ':')}`. Pass _apiKey (BYO key).
 * Rates + tracking are free on EasyPost; sign up at easypost.com.
 */


const BASE_URL = 'https://api.easypost.com/v2';

const tools: McpToolExport['tools'] = [
  {
    name: 'easypost_rates',
    description:
      'Get shipping rate quotes from `<from_zip>` to `<to_zip>` for a parcel — returns multi-carrier rates (USPS, UPS, FedEx, etc.) with price, service level, and estimated delivery days. Example: easypost_rates({ from_zip: "94105", to_zip: "10001", weight_oz: 16, _apiKey: "your-key" })',
    inputSchema: {
      type: 'object' as const,
      properties: {
        to_zip: {
          type: 'string',
          description: 'Destination postal/ZIP code, e.g. "10001"',
        },
        to_country: {
          type: 'string',
          description: 'Destination ISO country code (default "US")',
        },
        to_state: {
          type: 'string',
          description: 'Destination state/province code (optional), e.g. "NY"',
        },
        to_city: {
          type: 'string',
          description: 'Destination city (optional), e.g. "New York"',
        },
        from_zip: {
          type: 'string',
          description: 'Origin postal/ZIP code, e.g. "94105"',
        },
        from_country: {
          type: 'string',
          description: 'Origin ISO country code (default "US")',
        },
        weight_oz: {
          type: 'number',
          description: 'Parcel weight in ounces, e.g. 16 for 1 lb',
        },
        length_in: {
          type: 'number',
          description: 'Parcel length in inches (optional)',
        },
        width_in: {
          type: 'number',
          description: 'Parcel width in inches (optional)',
        },
        height_in: {
          type: 'number',
          description: 'Parcel height in inches (optional)',
        },
        _apiKey: {
          type: 'string',
          description: 'EasyPost API key (get one free at easypost.com)',
        },
      },
      required: ['to_zip', 'from_zip', 'weight_oz', '_apiKey'],
    },
  },
  {
    name: 'easypost_track',
    description:
      'Track a package by tracking number — returns current status, carrier, estimated delivery date, and recent scan events. Example: easypost_track({ tracking_code: "9400100000000000000000", carrier: "USPS", _apiKey: "your-key" })',
    inputSchema: {
      type: 'object' as const,
      properties: {
        tracking_code: {
          type: 'string',
          description: 'Carrier tracking number, e.g. "9400100000000000000000"',
        },
        carrier: {
          type: 'string',
          description: 'Carrier name (optional but recommended), e.g. "USPS", "UPS", "FedEx"',
        },
        _apiKey: {
          type: 'string',
          description: 'EasyPost API key (get one free at easypost.com)',
        },
      },
      required: ['tracking_code', '_apiKey'],
    },
  },
];

function requireKey(apiKey: string, tool: string) {
  if (!apiKey) {
    throw new Error(
      `${tool} requires an EasyPost API key. Pass _apiKey from your EasyPost account (sign up free at easypost.com — rates and tracking are free). Bring your own key, or add credits at https://pipeworx.io/account.`,
    );
  }
}

interface EasyPostError {
  error?: { message?: string };
}

// Shared fetch for GET/POST with EasyPost HTTP Basic auth (key = username,
// empty password). btoa is available in CF Workers / modern runtimes.
async function epFetch(
  method: 'GET' | 'POST',
  path: string,
  apiKey: string,
  tool: string,
  body?: unknown,
): Promise<Record<string, unknown>> {
  requireKey(apiKey, tool);
  const headers: Record<string, string> = {
    Authorization: `Basic ${btoa(apiKey + ':')}`,
  };
  if (method === 'POST') headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    throw new Error(`EasyPost ${tool}: auth failed (HTTP 401) — check your EasyPost _apiKey.`);
  }
  if (!res.ok) {
    let message: string | undefined;
    try {
      const err = (await res.json()) as EasyPostError;
      message = err.error?.message;
    } catch {
      // non-JSON body; fall through to status-only error
    }
    if (message) throw new Error(`EasyPost ${tool}: ${message}`);
    throw new Error(`EasyPost ${tool} error: HTTP ${res.status}`);
  }
  return (await res.json()) as Record<string, unknown>;
}

async function getRates(args: Record<string, unknown>, apiKey: string) {
  const to_zip = args.to_zip as string;
  const from_zip = args.from_zip as string;
  const weight_oz = args.weight_oz as number;
  if (!to_zip || !from_zip || weight_oz === undefined || weight_oz === null) {
    throw new Error(
      'easypost_rates requires to_zip, from_zip, and weight_oz (parcel weight in ounces).',
    );
  }

  const to_address: Record<string, unknown> = {
    zip: to_zip,
    country: (args.to_country as string) ?? 'US',
  };
  if (args.to_state) to_address.state = args.to_state as string;
  if (args.to_city) to_address.city = args.to_city as string;

  const from_address: Record<string, unknown> = {
    zip: from_zip,
    country: (args.from_country as string) ?? 'US',
  };

  const parcel: Record<string, unknown> = {
    weight: weight_oz,
    length: args.length_in as number | undefined,
    width: args.width_in as number | undefined,
    height: args.height_in as number | undefined,
  };

  const data = await epFetch('POST', '/shipments', apiKey, 'easypost_rates', {
    shipment: { to_address, from_address, parcel },
  });

  const rawRates = (data.rates as Array<Record<string, unknown>>) ?? [];
  const rates = rawRates
    .slice()
    .sort((a, b) => Number(a.rate) - Number(b.rate))
    .map((r) => ({
      carrier: r.carrier as string,
      service: r.service as string,
      rate: r.rate as string,
      currency: r.currency as string,
      delivery_days: (r.delivery_days as number | null) ?? null,
      est_delivery_date: (r.delivery_date as string | null) ?? null,
    }));

  return { rates };
}

async function trackPackage(args: Record<string, unknown>, apiKey: string) {
  const tracking_code = args.tracking_code as string;
  if (!tracking_code) {
    throw new Error('easypost_track requires a tracking_code (the carrier tracking number).');
  }
  const carrier = args.carrier as string | undefined;

  const tracker: Record<string, unknown> = { tracking_code };
  if (carrier) tracker.carrier = carrier;

  const data = await epFetch('POST', '/trackers', apiKey, 'easypost_track', { tracker });

  const details = (data.tracking_details as Array<Record<string, unknown>>) ?? [];
  return {
    tracking_code: data.tracking_code as string,
    status: data.status as string,
    carrier: data.carrier as string,
    est_delivery_date: (data.est_delivery_date as string | null) ?? null,
    tracking_details: details.slice(0, 15).map((d) => {
      const loc = (d.tracking_location ?? {}) as Record<string, unknown>;
      return {
        status: d.status as string,
        message: (d.message as string | null) ?? null,
        datetime: d.datetime as string,
        location: {
          city: (loc.city as string | null) ?? null,
          state: (loc.state as string | null) ?? null,
          country: (loc.country as string | null) ?? null,
        },
      };
    }),
  };
}

async function callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  const apiKey = args._apiKey as string;
  delete args._apiKey;

  switch (name) {
    case 'easypost_rates':
      return getRates(args, apiKey);
    case 'easypost_track':
      return trackPackage(args, apiKey);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export default { tools, callTool, meter: { credits: 1 } } satisfies McpToolExport;
