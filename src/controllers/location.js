import Location from "../models/Location.js";

export const getLocations = async (req, res) => {
    try {
        const locations = await Location.find();
        res.json(locations);
    } catch (e) {
        console.log(e)
    }
}