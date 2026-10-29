import createClient from "openapi-fetch"
import type { paths } from "./schema"

export const client = createClient<paths>({
    baseUrl: "https://amra-signal.devusimple.workers.dev",
    headers: {
        "Accept": "*/*",
        "Authoraization": "Bearer "
    }
})