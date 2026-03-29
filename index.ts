import {api, opendiscord, utilities} from "#opendiscord"

if (utilities.project != "openticket") throw new api.ODPluginError("This plugin only works in Open Ticket!")

//DECLARATION
export interface OTTranscriptRouteRule {
    optionid?:string,
    channel:string,
    mode?:"mirror"|"redirect"
}
class OTTranscriptControlConfig extends api.ODJsonConfig {
    declare data: OTTranscriptRouteRule[]
}
declare module "#opendiscord-types" {
    export interface ODPluginManagerIds_Default {
        "ot-transcript-control":api.ODPlugin
    }
    export interface ODConfigManagerIds_Default {
        "ot-transcript-control:config":OTTranscriptControlConfig
    }
    export interface ODCheckerManagerIds_Default {
        "ot-transcript-control:config":api.ODChecker
    }
}

//REGISTER CONFIG
opendiscord.events.get("onConfigLoad").listen((configs) => {
    configs.add(new OTTranscriptControlConfig("ot-transcript-control:config","config.json","./plugins/ot-transcript-control/"))
})

//REGISTER CONFIG CHECKER
opendiscord.events.get("onCheckerLoad").listen((checkers) => {
    const routeRowStructure = new api.ODCheckerObjectStructure("ot-transcript-control:route",{
        cliDisplayKeyInParentArray:"optionid",
        cliDisplayAdditionalKeysInParentArray:["channel","mode"],
        children:[
            {key:"optionid",optional:true,priority:0,checker:new api.ODCheckerStringStructure("ot-transcript-control:optionid",{
                maxLength:128,
                cliDisplayName:"Ticket option id",
                cliDisplayDescription:"Match this transcript route to a ticket option id. Leave empty for a fallback route.",
            })},
            {key:"channel",optional:false,priority:0,checker:new api.ODCheckerCustomStructure_DiscordId("ot-transcript-control:channel","channel",false,[],{
                cliDisplayName:"Archive channel",
                cliDisplayDescription:"Discord channel id where the transcript copy is sent.",
            })},
            {key:"mode",optional:true,priority:0,checker:new api.ODCheckerStringStructure("ot-transcript-control:mode",{
                choices:["mirror","redirect"],
                cliInitDefaultValue:"mirror",
                cliDisplayName:"Mode",
                cliDisplayDescription:"mirror: also send to the default transcript channel. redirect: only send to this archive channel.",
            })},
        ],
        cliDisplayName:"Route",
        cliDisplayDescription:"Map a ticket option (or fallback) to an archive channel and send mode.",
    })

    const routeArrayStructure = new api.ODCheckerArrayStructure("ot-transcript-control:routes",{
        allowedTypes:["object"],
        cliDisplayPropertyName:"route",
        propertyChecker:routeRowStructure,
        cliDisplayName:"Transcript routes",
        cliDisplayDescription:"Ordered rules: specific optionid matches first, then the first fallback row (empty optionid).",
    })

    const config = opendiscord.configs.get("ot-transcript-control:config")!
    checkers.add(new api.ODChecker("ot-transcript-control:config",checkers.storage,0,config,routeArrayStructure,{
        cliDisplayName:"Transcript Control",
        cliDisplayDescription:"Route transcripts per ticket option to a channel of your choice.",
    }))
})

//HOOK TRANSCRIPT COMPILERS
function readRouteRows(): OTTranscriptRouteRule[] | null {
    const cfg = opendiscord.configs.get("ot-transcript-control:config")
    if (!cfg) return null
    const rows = cfg.data
    if (!Array.isArray(rows)) return null
    return rows
}

function rowOptionKey(row: OTTranscriptRouteRule): string {
    const v = row.optionid
    if (typeof v === "string") return v.trim()
    return ""
}

function normalizeAppliedRule(
    row: OTTranscriptRouteRule,
    context: "specific" | "fallback"
): {channelId:string, mode:"mirror"|"redirect"} | null {
    const channelStr = row.channel.trim()
    if (!channelStr) {
        opendiscord.log(
            context === "specific"
                ? "ot-transcript-control: matched route has missing or empty channel; pass-through."
                : "ot-transcript-control: fallback route has missing or empty channel; pass-through.",
            "error",
            [{key:"context",value:context}]
        )
        return null
    }
    const mode = row.mode ?? "mirror"
    return {channelId:channelStr, mode}
}

/** Specific `optionid` match first, then first fallback row (missing/empty optionid). */
function resolveRoute(
    optionId: string,
    rows: OTTranscriptRouteRule[] | null
): {channelId:string, mode:"mirror"|"redirect"} | null {
    if (!rows?.length) return null
    const tid = optionId.trim()

    for (const row of rows) {
        const key = rowOptionKey(row)
        if (key === "") continue
        if (key === tid) return normalizeAppliedRule(row,"specific")
    }

    for (const row of rows) {
        if (rowOptionKey(row) !== "") continue
        return normalizeAppliedRule(row,"fallback")
    }

    return null
}

function wrapCompilerReady(compiler: api.ODTranscriptCompiler<any, object | null>) {
    const orig = compiler.ready
    if (!orig) return

    compiler.ready = async (result) => {
        const out = await orig(result)
        const rows = readRouteRows()
        const route = resolveRoute(result.ticket.option.id.value,rows)
        if (!route) return out

        try {
            if (out.channelMessage) {
                const mainServer = opendiscord.client.mainServer
                if (!mainServer) {
                    opendiscord.log("ot-transcript-control: No main server for archive channel","error",[])
                } else {
                    const archiveChannel = await opendiscord.client.fetchGuildChannel(mainServer,route.channelId)
                    if (!archiveChannel || !archiveChannel.isTextBased()) {
                        opendiscord.log("ot-transcript-control: Archive channel missing or not text-based","error",[
                            {key:"channelId",value:route.channelId},
                        ])
                    } else {
                        await archiveChannel.send(out.channelMessage.message)
                    }
                }
            }
        } catch (err) {
            opendiscord.log("ot-transcript-control: Archive send failed","error",[{key:"error",value:String(err)}])
        }
        if (route.mode === "redirect" && out.channelMessage) {
            return {...out, channelMessage:undefined}
        }
        return out
    }
}

opendiscord.events.get("onTranscriptCompilerLoad").listen(async (transcripts) => {
    const text = transcripts.get("opendiscord:text-compiler")
    const html = transcripts.get("opendiscord:html-compiler")
    if (text) wrapCompilerReady(text)
    if (html) wrapCompilerReady(html)
})
