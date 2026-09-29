import { BlockPermutation } from "@minecraft/server";
import { Jobs } from "@modules/jobs.js";
import { CommandInfo, RawText, Vector } from "@notbeer-api";
import { registerCommand } from "../register_commands.js";
import { fluidLookPositions } from "./drain.js";
import { floodFill } from "./floodfill_func.js";
import { assertSelection } from "@modules/assert.js";
import { Mask } from "@modules/mask.js";
import { Pattern } from "@modules/pattern.js";

const registerInformation: CommandInfo = {
    name: "fixwater",
    permission: "worldedit.utility.fixwater",
    description: "commands.wedit:fixwater.description",
    usage: [{ flag: "s" }, { name: "radius", type: "float", default: -1 }],
};

registerCommand(registerInformation, function* (session, builder, args) {
    if (args.has("s")) {
        assertSelection(session);

        const [shape, loc] = session.selection.getShape();
        const count = yield* Jobs.run(
            session,
            2,
            shape.generate(loc, new Pattern("water"), new Mask("water"), session, {
                ignoreGlobalMask: true,
            })
        );

        return RawText.translate("commands.wedit:blocks.changed").with(`${count}`);
    }

    const dimension = builder.dimension;
    const playerBlock = session.getPlacementPosition();
    let fixwaterStart: Vector | undefined;
    for (const offset of fluidLookPositions) {
        const loc = playerBlock.offset(offset.x, offset.y, offset.z);
        const block = dimension.getBlock(loc);
        if (block?.typeId.match("water")) {
            fixwaterStart = loc;
            break;
        }
    }

    if (!fixwaterStart) throw "commands.wedit:fixWater.noWater";

    const blocks = yield* Jobs.run(session, 1, function* () {
        yield Jobs.nextStep("commands.wedit:fixwater.fixing");
        yield Jobs.setProgress(-1);

        const blocks = yield* floodFill(fixwaterStart, args.get("radius"), (ctx) => !!ctx.nextBlock.typeId.match("water"));

        if (!blocks.size) return blocks;

        const history = session.history;
        const record = history.record();
        try {
            yield* history.trackRegion(record, blocks);
            let i = 0;
            for (const loc of blocks) {
                (yield* Jobs.loadBlock(loc))?.setPermutation(BlockPermutation.resolve("water"));
                yield Jobs.setProgress(i++ / blocks.size);
            }
            yield* history.commit(record);
        } catch (err) {
            history.cancel(record);
            throw err;
        }
        return blocks;
    });

    return RawText.translate("commands.wedit:blocks.changed").with(`${blocks.size}`);
});
