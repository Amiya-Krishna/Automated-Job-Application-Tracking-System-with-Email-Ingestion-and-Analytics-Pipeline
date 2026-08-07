import { useState } from "react";
import api from "../api";
import { getStoredToken } from "../utils/auth";

function AddJob() {

  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");

  const addJob = async () => {

    try {

      const token = getStoredToken();

      await api.post(
        "/jobs",
        { company, role },
        { headers: { token } }
      );

      alert("Job Added Successfully");

      window.location.href = "/";

    } catch (err) {
      alert(err.response.data.message);
    }

  };

  return (

    <div className="min-h-screen flex items-center justify-center bg-gray-100">

      <div className="bg-white p-6 rounded shadow w-[400px]">

        <h2 className="text-xl font-bold mb-4">Add Job</h2>

        <input
          className="w-full border p-2 mb-3"
          placeholder="Company"
          onChange={(e) => setCompany(e.target.value)}
        />

        <input
          className="w-full border p-2 mb-3"
          placeholder="Role"
          onChange={(e) => setRole(e.target.value)}
        />

        <button
          onClick={addJob}
          className="w-full bg-blue-600 text-white p-2"
        >
          Add Job
        </button>

      </div>

    </div>

  );
}

export default AddJob;
